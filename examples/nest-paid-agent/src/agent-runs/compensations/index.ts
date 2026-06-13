import { operation } from '@pathline/core';
import type { RunPaidAgentContext } from '../run-paid-agent.context.js';
import type { RunPaidAgentDeps } from '../services/index.js';

type Ctx = RunPaidAgentContext;
type Deps = RunPaidAgentDeps;

export const releaseReservedUsage = operation<Ctx, Deps>('Release reserved usage')
  .dependsOn('usageService')
  .handler(async (ctx, deps) => {
    if (ctx.reservation) await deps.usageService.release(ctx.reservation.id);
  });

export const voidOverageCharge = operation<Ctx, Deps>('Void overage charge')
  .dependsOn('billingService')
  .handler(async (ctx, deps) => {
    if (ctx.overageAuthorized) await deps.billingService.voidOverage(ctx.input.workspaceId);
  });

export const writeFailureAuditLog = operation<Ctx, Deps>('Write failure audit log')
  .dependsOn('auditService')
  .handler(async (ctx, deps) => {
    await deps.auditService.record('agent_run_failed', {
      workspaceId: ctx.input.workspaceId,
    });
  });
