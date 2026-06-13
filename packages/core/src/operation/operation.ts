/* eslint-disable @typescript-eslint/no-explicit-any */
import { slugify } from '../internal/ids.js';
import type {
  ContextKey,
  DepKey,
  NamedOptions,
  OperationDefinition,
  OperationHandler,
  RetryPolicy,
  RuntimeApi,
} from '../types.js';

/**
 * Apply a shallow patch returned by a handler onto the context.
 *
 * Handlers may either mutate `ctx` directly or `return` a `Partial<TContext>`;
 * this merges that returned patch (top-level keys win) after the handler runs.
 * @internal
 */
export function applyPatch<TContext>(
  ctx: TContext,
  patch: void | Partial<TContext>,
): void {
  if (patch && typeof patch === 'object') {
    Object.assign(ctx as object, patch);
  }
}

/**
 * The deps shape a handler is allowed to read, given which keys were declared.
 *
 * - If `dependsOn(...)` was never called (`TDeclaredSet = false`), the handler
 *   sees the full `TDeps` (back-compat; deps-free operations are unaffected).
 * - Once `dependsOn(...)` is called, the handler only sees the declared keys, so
 *   reading an undeclared dependency becomes a compile-time error.
 */
type HandlerDeps<TDeps, TDeclared extends keyof TDeps, TDeclaredSet extends boolean> =
  [TDeclaredSet] extends [true] ? Pick<TDeps, TDeclared> : TDeps;

/** Patch keys allowed on `return` once `.writes(...)` has been called. */
type HandlerPatch<
  TContext,
  TDeclaredWrites extends keyof TContext,
  TWritesDeclared extends boolean,
> = [TWritesDeclared] extends [true]
  ? Partial<Pick<TContext, TDeclaredWrites>>
  : Partial<TContext>;

/**
 * Fluent builder for a leaf {@link operation}. Configure optional metadata, then
 * finish with `.handler(fn)` to produce a runnable {@link OperationDefinition}.
 *
 * Type parameters after `TDeps` track declared `dependsOn` / `reads` / `writes`
 * keys so the handler's `deps` and returned patches can be narrowed — see
 * {@link HandlerDeps} and {@link HandlerPatch}.
 */
class OperationBuilder<
  TContext,
  TDeps,
  TDeclaredDeps extends keyof TDeps = never,
  TDepsDeclared extends boolean = false,
  TDeclaredReads extends keyof TContext = never,
  TReadsDeclared extends boolean = false,
  TDeclaredWrites extends keyof TContext = never,
  TWritesDeclared extends boolean = false,
> {
  private readonly _id: string;
  private readonly _name: string;
  private _reads: string[] = [];
  private _writes: string[] = [];
  private _dependsOn: string[] = [];
  private _timeoutMs?: number;
  private _retry?: RetryPolicy;
  private _metadata?: Record<string, unknown>;
  private _tags: string[] = [];
  private _redactTrace?: (ctx: TContext) => unknown;

  constructor(name: string, options?: NamedOptions) {
    this._name = name;
    this._id = options?.id ?? slugify(name);
  }

  /**
   * Declare which context keys this operation reads.
   *
   * **What:** records keys for `describe()` / `validate()` and enables dev/test
   * warnings when a declared read is unused or an undeclared key is read.
   *
   * **When to use:** for every context field the handler reads. If you never call
   * `reads`, no read tracking is performed (back-compat).
   *
   * **Why:** makes data dependencies explicit. Pass a concrete `TContext` for IDE
   * autocomplete. Compile-time enforcement applies to `dependsOn` and returned
   * write patches (`writes()`); context reads are checked at dev/test runtime
   * because handlers usually mutate `ctx` directly.
   */
  reads<K extends ContextKey<TContext>>(key: K): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps,
    TDepsDeclared,
    TDeclaredReads | K,
    true,
    TDeclaredWrites,
    TWritesDeclared
  >;
  reads<K1 extends ContextKey<TContext>, K2 extends ContextKey<TContext>>(
    key1: K1,
    key2: K2,
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps,
    TDepsDeclared,
    TDeclaredReads | K1 | K2,
    true,
    TDeclaredWrites,
    TWritesDeclared
  >;
  reads<
    K1 extends ContextKey<TContext>,
    K2 extends ContextKey<TContext>,
    K3 extends ContextKey<TContext>,
  >(
    key1: K1,
    key2: K2,
    key3: K3,
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps,
    TDepsDeclared,
    TDeclaredReads | K1 | K2 | K3,
    true,
    TDeclaredWrites,
    TWritesDeclared
  >;
  reads<
    K1 extends ContextKey<TContext>,
    K2 extends ContextKey<TContext>,
    K3 extends ContextKey<TContext>,
    K4 extends ContextKey<TContext>,
  >(
    key1: K1,
    key2: K2,
    key3: K3,
    key4: K4,
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps,
    TDepsDeclared,
    TDeclaredReads | K1 | K2 | K3 | K4,
    true,
    TDeclaredWrites,
    TWritesDeclared
  >;
  reads(
    ...keys: ContextKey<TContext>[]
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps,
    TDepsDeclared,
    TDeclaredReads | ContextKey<TContext>,
    true,
    TDeclaredWrites,
    TWritesDeclared
  > {
    this._reads.push(...keys);
    return this as unknown as OperationBuilder<
      TContext,
      TDeps,
      TDeclaredDeps,
      TDepsDeclared,
      TDeclaredReads | ContextKey<TContext>,
      true,
      TDeclaredWrites,
      TWritesDeclared
    >;
  }

  /**
   * Declare which context keys this operation writes.
   *
   * **What:** records keys, **narrows handler `return` patches** to those keys
   * (undeclared keys in a returned patch are compile-time errors), and enables
   * dev/test warnings for direct `ctx` mutations.
   *
   * **When to use:** whenever the handler populates context fields - especially
   * inside `parallel()` sections.
   *
   * **Why:** feeds `validate()` (`PARALLEL_WRITE_CONFLICT`) and keeps write
   * intent honest. Pass a concrete `TContext` for IDE autocomplete.
   */
  writes<K extends ContextKey<TContext>>(key: K): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps,
    TDepsDeclared,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites | K,
    true
  >;
  writes<K1 extends ContextKey<TContext>, K2 extends ContextKey<TContext>>(
    key1: K1,
    key2: K2,
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps,
    TDepsDeclared,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites | K1 | K2,
    true
  >;
  writes<
    K1 extends ContextKey<TContext>,
    K2 extends ContextKey<TContext>,
    K3 extends ContextKey<TContext>,
  >(
    key1: K1,
    key2: K2,
    key3: K3,
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps,
    TDepsDeclared,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites | K1 | K2 | K3,
    true
  >;
  writes<
    K1 extends ContextKey<TContext>,
    K2 extends ContextKey<TContext>,
    K3 extends ContextKey<TContext>,
    K4 extends ContextKey<TContext>,
  >(
    key1: K1,
    key2: K2,
    key3: K3,
    key4: K4,
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps,
    TDepsDeclared,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites | K1 | K2 | K3 | K4,
    true
  >;
  writes(
    ...keys: ContextKey<TContext>[]
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps,
    TDepsDeclared,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites | ContextKey<TContext>,
    true
  > {
    this._writes.push(...keys);
    return this as unknown as OperationBuilder<
      TContext,
      TDeps,
      TDeclaredDeps,
      TDepsDeclared,
      TDeclaredReads,
      TReadsDeclared,
      TDeclaredWrites | ContextKey<TContext>,
      true
    >;
  }

  /**
   * Declare the injected dependencies this operation uses (keys of `TDeps`,
   * e.g. `'billingService'`).
   *
   * **What:** records the declared keys and - importantly - **narrows the
   * handler's `deps` argument to only these keys**. Reading a dependency you did
   * not declare becomes a TypeScript error; declaring a key not on `TDeps` is
   * also a type error.
   *
   * **When to use:** for every operation that calls an injected service. Call it
   * once with all required keys (or chain multiple calls - they accumulate).
   *
   * **Why:** keeps declarations honest. `withDependencies(deps)` still validates
   * at bind time (throwing `MISSING_FLOW_DEPENDENCY` for a declared-but-absent
   * service), and at dev/test time the runtime warns about declared-but-unused
   * deps. If you never call `dependsOn`, the handler sees the full `TDeps`
   * (deps-free operations are unaffected).
   *
   * Pass a concrete `TDeps` interface to `operation()` (e.g.
   * `operation<Ctx, RunPaidAgentDeps>(...)`) so the IDE autocompletes each
   * dependency key as you type inside `.dependsOn('...')`.
   */
  dependsOn<K extends DepKey<TDeps>>(dep: K): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps | K,
    true,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites,
    TWritesDeclared
  >;
  dependsOn<K1 extends DepKey<TDeps>, K2 extends DepKey<TDeps>>(
    dep1: K1,
    dep2: K2,
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps | K1 | K2,
    true,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites,
    TWritesDeclared
  >;
  dependsOn<
    K1 extends DepKey<TDeps>,
    K2 extends DepKey<TDeps>,
    K3 extends DepKey<TDeps>,
  >(
    dep1: K1,
    dep2: K2,
    dep3: K3,
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps | K1 | K2 | K3,
    true,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites,
    TWritesDeclared
  >;
  dependsOn<
    K1 extends DepKey<TDeps>,
    K2 extends DepKey<TDeps>,
    K3 extends DepKey<TDeps>,
    K4 extends DepKey<TDeps>,
  >(
    dep1: K1,
    dep2: K2,
    dep3: K3,
    dep4: K4,
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps | K1 | K2 | K3 | K4,
    true,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites,
    TWritesDeclared
  >;
  dependsOn<
    K1 extends DepKey<TDeps>,
    K2 extends DepKey<TDeps>,
    K3 extends DepKey<TDeps>,
    K4 extends DepKey<TDeps>,
    K5 extends DepKey<TDeps>,
  >(
    dep1: K1,
    dep2: K2,
    dep3: K3,
    dep4: K4,
    dep5: K5,
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps | K1 | K2 | K3 | K4 | K5,
    true,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites,
    TWritesDeclared
  >;
  dependsOn(
    ...deps: DepKey<TDeps>[]
  ): OperationBuilder<
    TContext,
    TDeps,
    TDeclaredDeps | DepKey<TDeps>,
    true,
    TDeclaredReads,
    TReadsDeclared,
    TDeclaredWrites,
    TWritesDeclared
  > {
    this._dependsOn.push(...deps);
    return this as unknown as OperationBuilder<
      TContext,
      TDeps,
      TDeclaredDeps | DepKey<TDeps>,
      true,
      TDeclaredReads,
      TReadsDeclared,
      TDeclaredWrites,
      TWritesDeclared
    >;
  }

  /**
   * Fail this operation if its handler does not settle within `ms`.
   *
   * **When to use:** for external calls (DB, HTTP, AI, payment providers) that
   * could hang.
   *
   * **Why:** prevents one slow leaf from stalling the whole flow; on expiry the
   * run fails with `failureKind: 'timeout'`. Combine with `retry()` for
   * resilient external calls.
   */
  timeoutMs(ms: number): this {
    this._timeoutMs = ms;
    return this;
  }

  /**
   * Retry the handler on failure according to a {@link RetryPolicy}
   * (`attempts`, `backoff`, `delayMs`, `retryOn`).
   *
   * **When to use:** for idempotent, transient-failure-prone calls (network
   * blips, rate limits, timeouts).
   *
   * **Why:** improves resilience without scattering retry loops in handlers.
   * Each attempt is traced; use `retryOn` to retry only specific errors.
   * Cancellation via `AbortSignal` is never retried.
   */
  retry(policy: RetryPolicy): this {
    this._retry = policy;
    return this;
  }

  /**
   * Attach arbitrary, serializable metadata (e.g.
   * `{ external: true, provider: 'stripe' }`). Multiple calls merge.
   *
   * **When to use:** to record provider/ownership/governance facts about a leaf.
   *
   * **Why:** surfaces in describe/graph and devtools; does not affect execution.
   */
  metadata(meta: Record<string, unknown>): this {
    this._metadata = { ...this._metadata, ...meta };
    return this;
  }

  /**
   * Add free-form tags (e.g. `'billing'`, `'external'`).
   *
   * **When to use:** to group/filter operations across flows in docs and tests.
   *
   * **Why:** lightweight labels for discovery; no runtime effect.
   */
  tags(...tags: string[]): this {
    this._tags.push(...tags);
    return this;
  }

  /**
   * Provide a function that returns a sanitized view of the context for traces.
   *
   * **When to use:** for operations handling tokens/PII (e.g. authentication).
   *
   * **Why:** lets you opt into a redacted snapshot (e.g. `() => ({ token:
   * '[REDACTED]' })`) without ever exposing raw secrets - Pathline does not log
   * full context by default.
   */
  redactTrace(fn: (ctx: TContext) => unknown): this {
    this._redactTrace = fn;
    return this;
  }

  /**
   * Provide the implementation and produce the finished
   * {@link OperationDefinition}.
   *
   * **What:** the handler receives `(ctx, deps, runtime)`. `deps` is narrowed to
   * the keys declared via {@link OperationBuilder.dependsOn} (or the full
   * `TDeps` if none were declared), so using an undeclared dependency is a
   * compile-time error. It may mutate `ctx` directly **or** return a
   * `Partial<TContext>` patch (shallow-merged after it resolves; the patch wins
   * on top-level key conflicts). Use `runtime.signal` to honor cancellation in
   * long calls.
   *
   * **When to use:** the terminal call of every `operation(...)` chain.
   *
   * **Why:** keeps the "how" of one step isolated and unit-testable via the
   * returned definition's `run(ctx, deps)`.
   */
  handler(
    fn: (
      ctx: TContext,
      deps: HandlerDeps<TDeps, TDeclaredDeps, TDepsDeclared>,
      runtime: RuntimeApi,
    ) =>
      | void
      | HandlerPatch<TContext, TDeclaredWrites, TWritesDeclared>
      | Promise<void | HandlerPatch<TContext, TDeclaredWrites, TWritesDeclared>>,
  ): OperationDefinition<TContext, TDeps> {
    // The narrowed handler is structurally compatible with the full-deps
    // handler the runtime invokes, so this widening is safe.
    const widened = fn as unknown as OperationHandler<TContext, TDeps>;
    const declared = this._dependsOn;
    const definition: OperationDefinition<TContext, TDeps> = {
      id: this._id,
      name: this._name,
      reads: this._reads,
      writes: this._writes,
      dependsOn: declared,
      timeoutMs: this._timeoutMs,
      retry: this._retry,
      metadata: this._metadata,
      tags: this._tags,
      redactTrace: this._redactTrace,
      handler: widened,
      async run(ctx: TContext, deps: TDeps, runtime?: RuntimeApi): Promise<void> {
        const api: RuntimeApi = runtime ?? { runId: 'test-run' };
        const patch = await widened(ctx, deps, api);
        applyPatch(ctx, patch);
      },
    };
    return definition;
  }
}

/**
 * Define an isolated, independently testable leaf operation - one concrete unit
 * of work inside a flow.
 *
 * **What:** returns an {@link OperationBuilder}. Configure optional
 * `reads/writes/dependsOn/timeoutMs/retry/metadata/tags/redactTrace`, then call
 * `.handler(fn)`. Only `name` + `handler` are required.
 *
 * **When to use:** for every discrete step - load data, call a service,
 * transform context, perform a side effect. Reuse the same operation across
 * flows where it fits.
 *
 * **Why:** the flow says *what* happens; each operation says *how* one step
 * works. Operations are isolated, replaceable, and testable via
 * `op.run(ctx, deps)` without running the whole flow. Declaring `dependsOn`
 * narrows the handler's `deps` so undeclared usage is caught by the compiler.
 *
 * @typeParam TContext - the flow context this operation reads/writes.
 * @typeParam TDeps    - the injected services object passed as the 2nd arg.
 * @param name    - human-readable step name (shown in traces and describe).
 * @param options - optional `{ id }` to pin a stable id (defaults to a slug).
 *
 * @example
 * const loadUser = operation<Ctx, Deps>('Load user')
 *   .dependsOn('userService')
 *   .writes('user')
 *   .handler(async (ctx, deps) => { ctx.user = await deps.userService.find(ctx.id); });
 */
export function operation<TContext = any, TDeps = any>(
  name: string,
  options?: NamedOptions,
): OperationBuilder<TContext, TDeps> {
  return new OperationBuilder<TContext, TDeps>(name, options);
}

export type { OperationBuilder };
