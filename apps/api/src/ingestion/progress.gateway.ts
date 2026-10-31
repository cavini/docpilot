import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { PinoLogger } from 'nestjs-pino';
import { type Server, type Socket } from 'socket.io';
import { z } from 'zod';

import {
  INGESTION_EVENTS,
  INGESTION_EVENT_CHANNEL,
  type IngestionEvent,
} from './ingestion.events.js';

/** Namespace clients connect to for ingestion updates. */
export const INGESTION_NAMESPACE = '/ingestion';

/**
 * The most documents one client may watch.
 *
 * Without a cap, a single client could subscribe to every document and be
 * woken by all of them, which is both a waste and a way to make one
 * connection expensive for everyone.
 */
export const MAX_SUBSCRIPTIONS = 50;

/** Payload of a subscribe or unsubscribe message. */
const subscriptionSchema = z.object({
  documentIds: z.array(z.uuid()).min(1).max(MAX_SUBSCRIPTIONS),
});

/** What a document is doing right now, for the subscribe acknowledgement. */
export interface DocumentStateReader {
  readStates: (
    documentIds: string[],
  ) => Promise<{ documentId: string; status: string; progress: number }[]>;
}

/**
 * Pushes ingestion progress to connected clients.
 *
 * Clients join one room per document, so an event reaches exactly the sockets
 * that asked for it rather than being filtered client-side. Rooms also mean
 * Socket.IO's Redis adapter can fan out across API replicas without this code
 * changing.
 *
 * The gateway listens for the processor's events rather than being called by
 * it, so ingestion has no opinion about whether anyone is watching and the two
 * can run in different processes.
 */
@Injectable()
@WebSocketGateway({ namespace: INGESTION_NAMESPACE, cors: true })
export class IngestionProgressGateway implements OnGatewayConnection, OnGatewayDisconnect {
  /**
   * Assigned by Nest once the gateway is attached to an HTTP server.
   *
   * Optional rather than asserted: in a worker process there is no HTTP
   * server at all, and the relay below has to tolerate that rather than
   * throw on the first ingestion event.
   */
  @WebSocketServer()
  private server?: Server;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(IngestionProgressGateway.name);
  }

  handleConnection(client: Socket): void {
    this.logger.debug({ socketId: client.id }, 'client connected to ingestion progress');
  }

  handleDisconnect(client: Socket): void {
    // Socket.IO releases a disconnected socket's rooms itself; this is only
    // here to record it.
    this.logger.debug({ socketId: client.id }, 'client disconnected');
  }

  /**
   * Subscribes a client to one or more documents.
   *
   * The acknowledgement carries each document's current state, so a client
   * that connects after ingestion started is not left waiting for an event
   * that has already happened.
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): { ok: true; documentIds: string[] } | { ok: false; error: string } {
    const parsed = subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      // A malformed message from one client must not drop its connection.
      return {
        ok: false,
        error: `Expected { documentIds: string[] } with 1 to ${String(MAX_SUBSCRIPTIONS)} ids.`,
      };
    }

    for (const documentId of parsed.data.documentIds) {
      void client.join(roomFor(documentId));
    }

    return { ok: true, documentIds: parsed.data.documentIds };
  }

  /** Stops sending a client updates for the given documents. */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): { ok: true } | { ok: false; error: string } {
    const parsed = subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return { ok: false, error: 'Expected { documentIds: string[] }.' };
    }

    for (const documentId of parsed.data.documentIds) {
      void client.leave(roomFor(documentId));
    }

    return { ok: true };
  }

  /** Relays a processor event to the sockets watching that document. */
  @OnEvent(INGESTION_EVENT_CHANNEL)
  relay(event: IngestionEvent): void {
    const room = roomFor(event.payload.documentId);
    const name = INGESTION_EVENTS[event.type];

    this.server?.to(room).emit(name, event.payload);
  }
}

/** Room name for a document's subscribers. */
export function roomFor(documentId: string): string {
  return `document:${documentId}`;
}
