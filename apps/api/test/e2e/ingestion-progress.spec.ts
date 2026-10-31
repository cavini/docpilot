import { type INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { type AddressInfo } from 'node:net';
import { type Socket, io } from 'socket.io-client';

import { AppModule } from '../../src/app.module.js';
import {
  INGESTION_EVENTS,
  INGESTION_EVENT_CHANNEL,
  type IngestionEvent,
} from '../../src/ingestion/ingestion.events.js';
import { INGESTION_NAMESPACE } from '../../src/ingestion/progress.gateway.js';

const DOCUMENT_A = '3f1b9c2e-0000-4000-8000-00000000000a';
const DOCUMENT_B = '3f1b9c2e-0000-4000-8000-00000000000b';

/** Resolves with the next event of this name, or rejects on timeout. */
function once<T>(socket: Socket, event: string, timeoutMs = 3_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for "${event}"`));
    }, timeoutMs);

    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Resolves true if the event does NOT arrive within the window. */
async function silentFor(socket: Socket, event: string, ms = 400): Promise<boolean> {
  try {
    await once(socket, event, ms);
    return false;
  } catch {
    return true;
  }
}

describe('ingestion progress over websockets (e2e)', () => {
  let app: INestApplication;
  let events: EventEmitter2;
  let url: string;
  const sockets: Socket[] = [];

  const connect = async (): Promise<Socket> => {
    const socket = io(`${url}${INGESTION_NAMESPACE}`, { transports: ['websocket'] });
    sockets.push(socket);
    await once(socket, 'connect');
    return socket;
  };

  const subscribe = (socket: Socket, documentIds: string[]) =>
    new Promise<{ ok: boolean }>((resolve) => {
      socket.emit('subscribe', { documentIds }, resolve);
    });

  const publish = (event: IngestionEvent): void => {
    events.emit(INGESTION_EVENT_CHANNEL, event);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${String(address.port)}`;
    events = app.get(EventEmitter2);
  }, 90_000);

  afterEach(() => {
    for (const socket of sockets.splice(0)) {
      socket.disconnect();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC1: pushes a stage change to a subscribed client', async () => {
    const socket = await connect();
    await subscribe(socket, [DOCUMENT_A]);

    const received = once<{ documentId: string; status: string; progress: number }>(
      socket,
      INGESTION_EVENTS.progress,
    );
    publish({
      type: 'progress',
      payload: { documentId: DOCUMENT_A, status: 'chunking', progress: 35 },
    });

    await expect(received).resolves.toStrictEqual({
      documentId: DOCUMENT_A,
      status: 'chunking',
      progress: 35,
    });
  });

  it('AC2: pushes completion with everything ingestion determined', async () => {
    // Everything, because this event is the client's last word on the
    // document: a field missing here leaves a row with a hole in it until
    // something else happens to refetch.
    const socket = await connect();
    await subscribe(socket, [DOCUMENT_A]);

    const received = once<{ chunkCount: number }>(socket, INGESTION_EVENTS.completed);
    publish({
      type: 'completed',
      payload: {
        documentId: DOCUMENT_A,
        status: 'ready',
        chunkCount: 7,
        pageCount: null,
        language: 'english',
      },
    });

    await expect(received).resolves.toMatchObject({
      chunkCount: 7,
      status: 'ready',
      language: 'english',
    });
  });

  it('AC3: pushes a failure with its reason', async () => {
    const socket = await connect();
    await subscribe(socket, [DOCUMENT_A]);

    const received = once<{ error: string }>(socket, INGESTION_EVENTS.failed);
    publish({
      type: 'failed',
      payload: { documentId: DOCUMENT_A, status: 'failed', error: 'no text could be extracted' },
    });

    await expect(received).resolves.toMatchObject({ error: 'no text could be extracted' });
  });

  it('AC4: acknowledges a subscription, so a late client is not left blind', async () => {
    const socket = await connect();

    await expect(subscribe(socket, [DOCUMENT_A])).resolves.toMatchObject({
      ok: true,
      documentIds: [DOCUMENT_A],
    });
  });

  it('AC5: scopes events per document', async () => {
    const socket = await connect();
    await subscribe(socket, [DOCUMENT_A]);

    publish({
      type: 'progress',
      payload: { documentId: DOCUMENT_B, status: 'parsing', progress: 10 },
    });

    await expect(silentFor(socket, INGESTION_EVENTS.progress)).resolves.toBe(true);
  });

  it('AC6: stops sending after unsubscribe', async () => {
    const socket = await connect();
    await subscribe(socket, [DOCUMENT_A]);

    await new Promise<void>((resolve) => {
      socket.emit('unsubscribe', { documentIds: [DOCUMENT_A] }, () => {
        resolve();
      });
    });

    publish({
      type: 'progress',
      payload: { documentId: DOCUMENT_A, status: 'parsing', progress: 10 },
    });

    await expect(silentFor(socket, INGESTION_EVENTS.progress)).resolves.toBe(true);
  });

  it('AC7: rejects a malformed subscription without dropping the connection', async () => {
    const socket = await connect();

    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      socket.emit('subscribe', { documentIds: 'not-an-array' }, resolve);
    });

    expect(ack.ok).toBe(false);
    expect(ack.error).toMatch(/documentIds/);
    expect(socket.connected).toBe(true);
  });

  it('AC8: refuses to let one client subscribe to everything', async () => {
    const socket = await connect();
    const tooMany = Array.from(
      { length: 51 },
      (_unused, i) => `3f1b9c2e-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );

    const ack = await new Promise<{ ok: boolean }>((resolve) => {
      socket.emit('subscribe', { documentIds: tooMany }, resolve);
    });

    expect(ack.ok).toBe(false);
  });

  it('AC9: delivers to every client watching the same document', async () => {
    const first = await connect();
    const second = await connect();
    await subscribe(first, [DOCUMENT_A]);
    await subscribe(second, [DOCUMENT_A]);

    const both = Promise.all([
      once(first, INGESTION_EVENTS.progress),
      once(second, INGESTION_EVENTS.progress),
    ]);
    publish({
      type: 'progress',
      payload: { documentId: DOCUMENT_A, status: 'embedding', progress: 55 },
    });

    await expect(both).resolves.toHaveLength(2);
  });

  it('AC10: a malformed unsubscribe is rejected rather than ignored', async () => {
    const socket = await connect();

    const ack = await new Promise<{ ok: boolean }>((resolve) => {
      socket.emit('unsubscribe', { nope: true }, resolve);
    });

    expect(ack.ok).toBe(false);
  });
});
