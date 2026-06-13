import { flow, type ExecutableFlow } from '@pathline/core';
import type {
  RunPaidAgentContext,
  RunPaidAgentResponse,
} from '../run-paid-agent.context.js';
import type { RunPaidAgentDeps } from '../services/index.js';
import {
  authenticateUser,
  authorizeOverageCharge,
  commitUsage,
  emitAgentRunCompletedEvent,
  loadAuthenticatedUser,
  loadMembership,
  loadPlan,
  loadSubscription,
  loadUsage,
  loadWorkspace,
  parseRequestBody,
  reserveUsage,
  runAgent,
  saveAgentRun,
  serializeResponse,
  writeAuditLog,
} from '../operations/index.js';
import {
  planIncludesAgentRuns,
  subscriptionAllowsUsage,
  userCanAccessWorkspace,
} from '../guards/index.js';
import {
  releaseReservedUsage,
  voidOverageCharge,
  writeFailureAuditLog,
} from '../compensations/index.js';

export const RUN_PAID_AGENT_FLOW = Symbol('RUN_PAID_AGENT_FLOW');

export type RunPaidAgentFlow = ExecutableFlow<
  RunPaidAgentContext,
  RunPaidAgentResponse,
  RunPaidAgentDeps
>;

/** Build the run-paid-agent flow bound to concrete (or mock) services. */
export function buildRunPaidAgentFlow(deps: RunPaidAgentDeps): RunPaidAgentFlow {
  return flow<RunPaidAgentContext, RunPaidAgentResponse, RunPaidAgentDeps>(
    'Run paid AI agent',
  )
    .version('1.0.0')
    .metadata({ owner: 'ai-platform', criticality: 'high' })

    .stage('Request')
    .do(parseRequestBody)
    .do(authenticateUser)
    .do(loadAuthenticatedUser)

    .stage('Workspace access')
    .do(loadWorkspace)
    .parallel('Load access data', (p) =>
      p.do(loadMembership).do(loadSubscription).do(loadUsage),
    )
    .guard(userCanAccessWorkspace)

    .stage('Billing gate')
    .do(loadPlan)
    .guard(subscriptionAllowsUsage)
    .guard(planIncludesAgentRuns)
    .branch('Usage quota', (b) =>
      b
        .when('Within included quota', (ctx) => ctx.usage!.used < ctx.usage!.limit)
        .goTo('Reserve usage')
        .when('Overage allowed', (ctx) => ctx.plan!.allowsOverage === true)
        .goTo('Authorize overage')
        .otherwise()
        .goTo('Reject quota exceeded'),
    )

    .stage('Reject quota exceeded')
    .fail({
      statusCode: 402,
      code: 'QUOTA_EXCEEDED',
      message: 'Monthly AI agent run quota exceeded',
    })

    .stage('Authorize overage')
    .do(authorizeOverageCharge)
    .goTo('Reserve usage')

    .stage('Reserve usage')
    .do(reserveUsage)

    .stage('Execution')
    .do(runAgent)
    .do(saveAgentRun)

    .stage('Finalize')
    .parallel('Finalize side effects', (p) =>
      p
        .mode('collectAll')
        .do(commitUsage)
        .do(writeAuditLog)
        .do(emitAgentRunCompletedEvent),
    )
    .do(serializeResponse)

    .onFailure()
    .do(releaseReservedUsage)
    .do(voidOverageCharge)
    .do(writeFailureAuditLog)

    .output((ctx) => ctx.response!)
    .withDependencies(deps);
}
