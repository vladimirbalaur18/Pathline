import { guard, FlowHttpError } from '@pathline/core';
import type { RunPaidAgentContext } from '../run-paid-agent.context.js';
import type { RunPaidAgentDeps } from '../services/index.js';

type Ctx = RunPaidAgentContext;
type Deps = RunPaidAgentDeps;

export const userCanAccessWorkspace = guard<Ctx, Deps>('User can access workspace')
  .check((ctx) => Boolean(ctx.membership))
  .denyWith(() => {
    throw new FlowHttpError({
      statusCode: 403,
      code: 'WORKSPACE_ACCESS_DENIED',
      message: 'User cannot access this workspace',
    });
  });

export const subscriptionAllowsUsage = guard<Ctx, Deps>('Subscription allows usage')
  .check((ctx) => ['active', 'trialing'].includes(ctx.subscription?.status ?? ''))
  .denyWith(() => {
    throw new FlowHttpError({
      statusCode: 402,
      code: 'BILLING_INACTIVE',
      message: 'Billing is inactive',
    });
  });

export const planIncludesAgentRuns = guard<Ctx, Deps>('Plan includes AI agent runs')
  .check((ctx) => (ctx.plan?.features ?? []).includes('agent-runs'))
  .denyWith(() => {
    throw new FlowHttpError({
      statusCode: 403,
      code: 'FEATURE_NOT_INCLUDED',
      message: 'Plan does not include AI agent runs',
    });
  });
