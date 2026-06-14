/**
 * RFC prototype: linear context requires/provides (not wired to production APIs).
 *
 * Demonstrates how FlowBuilder could accumulate available context keys.
 * See docs/rfc/context-type-safety.md.
 */

interface Ctx {
  input: { workspaceId: string };
  workspace?: { id: string };
  subscription?: { planId: string };
  response?: { ok: boolean };
}

type ContextKey<T> = keyof T;

/** Context with required keys made non-optional. */
type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Phantom-tagged operation for the prototype. */
interface PrototypeOperation<
  TRequires extends ContextKey<Ctx>,
  TProvides extends ContextKey<Ctx>,
> {
  readonly __requires: TRequires;
  readonly __provides: TProvides;
  run(ctx: RequireKeys<Ctx, TRequires>): Promise<void>;
}

/** Keys known to be populated at the current point in a linear flow. */
type FlowAvailable<T extends ContextKey<Ctx>> = T;

/** Succeeds when Required is a subset of Available. */
type AssertCanRun<
  Available extends ContextKey<Ctx>,
  Required extends ContextKey<Ctx>,
> = Required extends Available ? true : false;

/** Merge provided keys into available set after a step. */
type AfterStep<
  Available extends ContextKey<Ctx>,
  Op extends PrototypeOperation<ContextKey<Ctx>, ContextKey<Ctx>>,
> = Available | Op['__provides'];

type ExpectTrue<T extends true> = T;

// --- Example operations ---

declare const loadWorkspace: PrototypeOperation<'input', 'workspace'>;
declare const loadSubscription: PrototypeOperation<'workspace', 'subscription'>;
declare const runAgent: PrototypeOperation<'subscription', 'response'>;

// --- Linear flow simulation ---

type S0 = FlowAvailable<'input'>;
type S1 = AfterStep<S0, typeof loadWorkspace>;
type S2 = AfterStep<S1, typeof loadSubscription>;
type S3 = AfterStep<S2, typeof runAgent>;

// loadSubscription after loadWorkspace: workspace is available
type _subscriptionOk = ExpectTrue<AssertCanRun<S1, 'workspace'>>;

// runAgent after full chain: subscription is available
type _agentOk = ExpectTrue<AssertCanRun<S2, 'subscription'>>;

// loadSubscription before workspace: should fail
// @ts-expect-error workspace not yet available
type _subscriptionTooEarly = ExpectTrue<AssertCanRun<S0, 'workspace'>>;

// runAgent before subscription: should fail
// @ts-expect-error subscription not yet available
type _agentTooEarly = ExpectTrue<AssertCanRun<S1, 'subscription'>>;

// Handler ctx narrowing: requires makes fields non-optional
declare function useSubscription(ctx: RequireKeys<Ctx, 'subscription'>): void;

async function _handlerNarrowingDemo() {
  const ctx = {} as RequireKeys<Ctx, 'workspace'>;
  ctx.workspace.id; // ok — workspace required, not optional
  // @ts-expect-error subscription not in requires set
  useSubscription(ctx);
}

// Final state includes response along the chain
type _finalHasResponse = ExpectTrue<'response' extends S3 ? true : false>;
