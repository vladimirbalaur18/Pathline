import { operation, FlowHttpError } from "@pathline/core";
import type { RunPaidAgentContext } from "../run-paid-agent.context.js";
import type { RunPaidAgentDeps } from "../services/index.js";

type Ctx = RunPaidAgentContext;
type Deps = RunPaidAgentDeps;

export const parseRequestBody = operation<Ctx, Deps>("Parse request body")
  .reads("input")
  .handler((ctx) => {
    const body = ctx.input.body;
    if (!body || typeof body.prompt !== "string" || body.prompt.length === 0) {
      throw new FlowHttpError({
        statusCode: 400,
        code: "INVALID_REQUEST_BODY",
        message: "A non-empty prompt is required",
      });
    }
  });

export const authenticateUser = operation<Ctx, Deps>("Authenticate user")
  .dependsOn("authService")
  .writes("auth")
  .redactTrace(() => ({ authorization: "[REDACTED]" }))
  .handler(async (ctx, deps) => {
    const auth = await deps.authService.verifyAccessToken(
      ctx.input.authorization,
    );
    if (!auth) {
      throw new FlowHttpError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Invalid or missing access token",
      });
    }
    return { auth };
  });

export const loadAuthenticatedUser = operation<Ctx, Deps>(
  "Load authenticated user",
)
  .dependsOn("userService")
  .reads("auth")
  .writes("user")
  .handler(async (ctx, deps) => {
    const user = await deps.userService.findById(ctx.auth!.userId);
    if (!user) {
      throw new FlowHttpError({
        statusCode: 404,
        code: "USER_NOT_FOUND",
        message: "Authenticated user not found",
      });
    }
    return { user };
  });

export const loadWorkspace = operation<Ctx, Deps>("Load workspace")
  .dependsOn("workspaceService")
  .writes("workspace")
  .handler(async (ctx, deps) => {
    const workspace = await deps.workspaceService.findById(
      ctx.input.workspaceId,
    );
    if (!workspace) {
      throw new FlowHttpError({
        statusCode: 404,
        code: "WORKSPACE_NOT_FOUND",
        message: "Workspace not found",
      });
    }
    return { workspace };
  });

export const loadMembership = operation<Ctx, Deps>("Load membership")
  .dependsOn("membershipService")
  .writes("membership")
  .handler(async (ctx, deps) => ({
    membership:
      (await deps.membershipService.find(
        ctx.input.workspaceId,
        ctx.auth!.userId,
      )) ?? undefined,
  }));

export const loadSubscription = operation<Ctx, Deps>("Load subscription")
  .dependsOn("billingService")
  .writes("subscription")
  .handler(async (ctx, deps) => ({
    subscription:
      (await deps.billingService.findSubscription(ctx.input.workspaceId)) ??
      undefined,
  }));

export const loadUsage = operation<Ctx, Deps>("Load usage")
  .dependsOn("usageService")
  .writes("usage")
  .handler(async (ctx, deps) => ({
    usage: await deps.usageService.getUsage(ctx.input.workspaceId),
  }));

export const loadPlan = operation<Ctx, Deps>("Load plan")
  .dependsOn("billingService")
  .reads("subscription")
  .writes("plan")
  .handler(async (ctx, deps) => {
    const plan = await deps.billingService.findPlan(ctx.subscription!.planId);
    if (!plan) {
      throw new FlowHttpError({
        statusCode: 404,
        code: "PLAN_NOT_FOUND",
        message: "Plan not found",
      });
    }
    return { plan };
  });

export const authorizeOverageCharge = operation<Ctx, Deps>(
  "Authorize overage charge",
)
  .dependsOn("billingService")
  .writes("overageAuthorized")
  .handler(async (ctx, deps) => {
    await deps.billingService.authorizeOverage(ctx.input.workspaceId);
    return { overageAuthorized: true };
  });

export const reserveUsage = operation<Ctx, Deps>("Reserve usage")
  .dependsOn("usageService")
  .writes("reservation")
  .handler(async (ctx, deps) => ({
    reservation: await deps.usageService.reserve(ctx.input.workspaceId),
  }));

export const runAgent = operation<Ctx, Deps>("Run agent")
  .dependsOn("aiGateway")
  .timeoutMs(10_000)
  .retry({ attempts: 2, backoff: "exponential" })
  .writes("agentResult")
  .handler(async (ctx, deps) => ({
    agentResult: await deps.aiGateway.run(ctx.input.body),
  }));

export const saveAgentRun = operation<Ctx, Deps>("Save agent run")
  .writes("agentRunId")
  .handler((ctx) => ({
    agentRunId: `run_${ctx.reservation!.id}`,
  }));

export const commitUsage = operation<Ctx, Deps>("Commit usage")
  .dependsOn("usageService")
  .handler(async (ctx, deps) => {
    await deps.usageService.commit(ctx.reservation!.id);
  });

export const writeAuditLog = operation<Ctx, Deps>("Write audit log")
  .dependsOn("auditService")
  .handler(async (ctx, deps) => {
    await deps.auditService.record("agent_run_completed", {
      agentRunId: ctx.agentRunId,
    });
  });

export const emitAgentRunCompletedEvent = operation<Ctx, Deps>(
  "Emit agent run completed event",
)
  .dependsOn("eventBus")
  .handler(async (ctx, deps) => {
    await deps.eventBus.emit("agent.run.completed", {
      agentRunId: ctx.agentRunId,
    });
  });

export const serializeResponse = operation<Ctx, Deps>("Serialize response")
  .writes("response")
  .handler((ctx) => ({
    response: {
      agentRunId: ctx.agentRunId!,
      output: ctx.agentResult!.output,
      usedOverage: ctx.overageAuthorized === true,
    },
  }));
