import { Module } from '@nestjs/common';
import { AgentRunsController } from './agent-runs.controller.js';
import { AgentRunsFlowModule } from './agent-runs.flow.module.js';

@Module({
  imports: [AgentRunsFlowModule],
  controllers: [AgentRunsController],
})
export class AgentRunsModule {}
