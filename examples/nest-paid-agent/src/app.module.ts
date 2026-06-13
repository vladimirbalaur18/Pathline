import { Module } from '@nestjs/common';
import { PathlineModule } from '@pathline/nestjs';
import { AgentRunsModule } from './agent-runs/agent-runs.module.js';

@Module({
  imports: [
    PathlineModule.forRoot({ tracing: true }),
    AgentRunsModule,
  ],
})
export class AppModule {}
