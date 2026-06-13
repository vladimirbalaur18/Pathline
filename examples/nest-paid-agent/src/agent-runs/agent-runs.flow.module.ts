import { Module } from '@nestjs/common';
import {
  RUN_PAID_AGENT_FLOW,
  buildRunPaidAgentFlow,
} from './flows/run-paid-agent.flow.js';
import { createMockDeps, type RunPaidAgentDeps } from './services/index.js';

export const RUN_PAID_AGENT_DEPS = Symbol('RUN_PAID_AGENT_DEPS');

/**
 * Provider-factory wiring. In a real app the deps token would be assembled from
 * individually-injected services (AuthService, BillingService, ...). Here we use
 * in-memory fakes so the example boots standalone.
 */
@Module({
  providers: [
    { provide: RUN_PAID_AGENT_DEPS, useFactory: () => createMockDeps() },
    {
      provide: RUN_PAID_AGENT_FLOW,
      useFactory: (deps: RunPaidAgentDeps) => buildRunPaidAgentFlow(deps),
      inject: [RUN_PAID_AGENT_DEPS],
    },
  ],
  exports: [RUN_PAID_AGENT_FLOW],
})
export class AgentRunsFlowModule {}
