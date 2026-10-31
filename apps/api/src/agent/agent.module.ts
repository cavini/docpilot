import { Module } from '@nestjs/common';

import { ChatModule } from '../chat/chat.module.js';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { AgentController } from './agent.controller.js';
import { AgentService } from './agent.service.js';

/**
 * The tool-calling agent.
 *
 * Imports `ChatModule` for the conversation store and the chat-model factory
 * rather than redeclaring either: an agent turn is a turn in the same
 * conversation as a chat turn, and a second store would let the two disagree
 * about what was said.
 */
@Module({
  imports: [ChatModule, RetrievalModule, FeatureFlagsModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
