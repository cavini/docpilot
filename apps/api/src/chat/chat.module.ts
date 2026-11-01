import { Module } from '@nestjs/common';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { createChatModel } from '../llm/provider.factory.js';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { AskController } from './ask.controller.js';
import { AskService } from './ask.service.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from './chat.tokens.js';

/** Answering questions from the corpus, one-shot and conversational. */
@Module({
  imports: [RetrievalModule],
  controllers: [AskController, ChatController, ConversationsController],
  providers: [
    AskService,
    ChatService,
    ConversationsService,
    {
      provide: CHAT_MODEL_FACTORY,
      inject: [ENV],
      useFactory:
        (env: Env): ChatModelFactory =>
        (mockScript, options) =>
          createChatModel(env, mockScript, options),
    },
  ],
  exports: [AskService, ChatService, ConversationsService, CHAT_MODEL_FACTORY],
})
export class ChatModule {}
