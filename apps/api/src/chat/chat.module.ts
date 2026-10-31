import { Module } from '@nestjs/common';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { createChatModel } from '../llm/provider.factory.js';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { AskController } from './ask.controller.js';
import { AskService } from './ask.service.js';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from './chat.tokens.js';

/** Answering questions from the corpus. */
@Module({
  imports: [RetrievalModule],
  controllers: [AskController],
  providers: [
    AskService,
    {
      provide: CHAT_MODEL_FACTORY,
      inject: [ENV],
      useFactory:
        (env: Env): ChatModelFactory =>
        (mockResponse) =>
          createChatModel(env, mockResponse),
    },
  ],
  exports: [AskService],
})
export class ChatModule {}
