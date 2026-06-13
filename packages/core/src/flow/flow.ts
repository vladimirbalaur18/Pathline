/* eslint-disable @typescript-eslint/no-explicit-any */
import { slugify } from '../internal/ids.js';
import { FlowError } from '../errors/index.js';
import { BranchBuilder } from '../branch/branch.js';
import { ParallelBuilder } from '../parallel/parallel.js';
import { RepeatBuilder } from '../repeat/repeat.js';
import { createExecutableFlow } from './executable.js';
import type {
  ExecutableFlow,
  FlowDefinition,
  FlowErrorInput,
  GuardDefinition,
  NamedOptions,
  OperationDefinition,
  StageDefinition,
  Step,
  SubflowDefinition,
} from '../types.js';

interface MutableStage<TContext, TDeps> {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
  tags: string[];
  steps: Step<TContext, TDeps>[];
}

type Section = 'stages' | 'onFailure' | 'finally';

/**
 * Top-down business-flow builder returned by {@link flow}.
 *
 * **What:** the fluent surface used to describe a complete operation as readable
 * `stage`s containing `do`/`guard`/`branch`/`parallel`/`repeat`/`subflow` steps,
 * plus optional `onFailure` (compensation) and `finally` (cleanup) sections,
 * finalized by `output()`.
 *
 * **When to use:** whenever an operation has more than a couple of steps,
 * business gates, branching, concurrency, loops, or cleanup/compensation - i.e.
 * logic you want to read top-to-bottom in one place.
 *
 * **Why:** a single mutable builder backs the whole chain so authoring reads
 * like a business process, not graph construction. Only one "current stage"
 * exists at a time; calling `.stage()` implicitly closes the previous stage.
 *
 * @typeParam TContext - the mutable state object threaded through every step.
 * @typeParam TOutput  - the value produced by `output()`.
 * @typeParam TDeps    - the injected services object passed to handlers/guards.
 */
export class FlowBuilder<TContext = any, TOutput = unknown, TDeps = any> {
  private readonly _name: string;
  private _version?: string;
  private _metadata?: Record<string, unknown>;
  private _tags: string[] = [];
  private _redact?: (ctx: TContext) => unknown;

  private readonly _stages: MutableStage<TContext, TDeps>[] = [];
  private readonly _onFailure: OperationDefinition<TContext, TDeps>[] = [];
  private readonly _finally: OperationDefinition<TContext, TDeps>[] = [];

  private _current?: MutableStage<TContext, TDeps>;
  private _section: Section = 'stages';

  constructor(name: string) {
    this._name = name;
  }

  /**
   * Tag the flow with a semantic version string (e.g. `'1.2.0'`).
   *
   * **When to use:** as soon as a flow is in production and may change shape.
   *
   * **Why:** the version is attached to every {@link FlowRunResult} so old logs
   * and traces can be matched to the exact flow that produced them, even after
   * the code changes. Pairs with `definitionHash` for precise diffs.
   */
  version(version: string): this {
    this._version = version;
    return this;
  }

  /**
   * Attach arbitrary, serializable metadata to the flow (e.g.
   * `{ owner: 'billing', criticality: 'high' }`).
   *
   * **When to use:** to record ownership, criticality, or governance data.
   *
   * **Why:** metadata surfaces in `describe()`/`toGraph()` and feeds devtools,
   * dashboards, and ownership tooling. It does not affect execution. Multiple
   * calls merge.
   */
  metadata(meta: Record<string, unknown>): this {
    this._metadata = { ...this._metadata, ...meta };
    return this;
  }

  /**
   * Add free-form tags to the flow (e.g. `'external'`, `'paid-feature'`).
   *
   * **When to use:** to group/filter flows in docs, dashboards, or tests.
   *
   * **Why:** tags are cheap labels for discovery and filtering; they do not
   * affect execution.
   */
  tags(...tags: string[]): this {
    this._tags.push(...tags);
    return this;
  }

  /**
   * Provide a function that produces a sanitized snapshot of the context.
   *
   * **When to use:** for flows that touch secrets/PII (auth, billing) when you
   * want a safe context snapshot available for debugging.
   *
   * **Why:** Pathline never serializes the full context into traces by default;
   * this lets you opt into a redacted view (e.g. `ctx => ({ input: { token:
   * '[REDACTED]' } })`) so no secrets leak. See also `operation.redactTrace`.
   */
  redact(fn: (ctx: TContext) => unknown): this {
    this._redact = fn;
    return this;
  }

  /**
   * Open a new named stage - a readable group of steps.
   *
   * **What:** stages are the top-level sections of a flow (e.g. `'Request'`,
   * `'Billing gate'`, `'Finalize'`). Steps added after this call belong to it,
   * in order, until the next `.stage()`/`.onFailure()`/`.finally()`.
   *
   * **When to use:** to chunk a flow into the business phases a reader expects.
   *
   * **Why:** stages give `goTo`/`branch` jump targets and make the flow map
   * legible. Pass `{ id }` to pin a stable id for metrics/traces; otherwise the
   * id is slugified from the name.
   */
  stage(name: string, options?: NamedOptions): this {
    this._section = 'stages';
    this._current = {
      id: options?.id ?? slugify(name),
      name,
      tags: [],
      steps: [],
    };
    this._stages.push(this._current);
    return this;
  }

  /**
   * Run a leaf {@link operation} as the next step.
   *
   * **What:** appends an operation to the current stage (or, after
   * `onFailure()`/`finally()`, to that section).
   *
   * **When to use:** for any concrete unit of work - load data, call a service,
   * transform context, perform a side effect.
   *
   * **Why:** operations are isolated and independently testable; the flow stays
   * a readable list of named steps while the "how" lives in each operation file.
   */
  do(operation: OperationDefinition<TContext, TDeps>): this {
    if (this._section === 'onFailure') {
      this._onFailure.push(operation);
      return this;
    }
    if (this._section === 'finally') {
      this._finally.push(operation);
      return this;
    }
    this.requireStage('do').steps.push({ kind: 'operation', operation });
    return this;
  }

  /**
   * Add a business {@link guard} that must pass for the flow to continue.
   *
   * **What:** evaluates the guard's `check`; if it fails, the guard's deny
   * handler runs (or a default `GUARD_DENIED` error is thrown) and the flow
   * fails with `failureKind: 'guard_denied'`.
   *
   * **When to use:** for gates/preconditions - authorization, entitlement,
   * billing status, feature flags.
   *
   * **Why:** guards express "may we proceed?" declaratively and show up in the
   * trace/describe output as explicit business checks rather than buried `if`s.
   */
  guard(guard: GuardDefinition<TContext, TDeps>): this {
    this.requireStage('guard').steps.push({ kind: 'guard', guard });
    return this;
  }

  /**
   * Jump to another stage by name (forward, acyclic jumps only).
   *
   * **When to use:** to skip ahead - e.g. a branch routes to `'Reject'` or
   * `'Reserve usage'`. For loops use {@link FlowBuilder.repeat} instead.
   *
   * **Why:** explicit, readable control flow. Loops via `goTo` are disallowed by
   * design; the `maxSteps` ceiling guards against accidental cycles.
   */
  goTo(stageName: string): this {
    this.requireStage('goTo').steps.push({ kind: 'goto', stageName });
    return this;
  }

  /**
   * Immediately fail the flow with a structured error.
   *
   * **When to use:** for terminal rejection stages (e.g. a `'Reject quota
   * exceeded'` stage that a branch routes to).
   *
   * **Why:** makes "this path ends the operation" obvious in one place. Provide
   * a `statusCode` to produce a {@link FlowHttpError} that the Nest filter can
   * map to an HTTP response.
   */
  fail(error: FlowErrorInput): this {
    this.requireStage('fail').steps.push({ kind: 'fail', error });
    return this;
  }

  /**
   * Run another {@link ExecutableFlow} as a nested step (minimal in v1).
   *
   * **What:** executes `flow` with the parent's context/deps; its trace nests
   * under this step. A subflow failure fails the parent step. Use `mapOutput`
   * to merge the subflow's output back into the parent context.
   *
   * **When to use:** to reuse a self-contained sub-operation (e.g. a shared
   * "check billing access" flow) across multiple parent flows.
   *
   * **Why:** composition without duplication, while keeping each piece testable.
   */
  subflow(
    flow: ExecutableFlow<any, any, any>,
    options?: NamedOptions & {
      mapOutput?: (ctx: TContext, output: unknown) => void | Partial<TContext>;
    },
  ): this {
    const subflow: SubflowDefinition<TContext> = {
      id: options?.id ?? slugify(flow.name),
      name: flow.name,
      flow,
      mapOutput: options?.mapOutput,
    };
    this.requireStage('subflow').steps.push({ kind: 'subflow', subflow });
    return this;
  }

  /**
   * Add a conditional {@link BranchBuilder branch} with named cases.
   *
   * **What:** evaluates `when(...)` predicates in order; the first match wins,
   * else `otherwise()`. Each case takes one action (`goTo`/`do`/`fail`/
   * `continueRepeat`/`stopRepeat`).
   *
   * **When to use:** when the next step depends on context - quota checks,
   * plan tiers, fallback selection.
   *
   * **Why:** branches make decision points explicit and traceable (the selected
   * case is recorded), instead of nested `if/else` scattered across services.
   *
   * @example
   * .branch('Usage quota', b =>
   *   b.when('within', ctx => ctx.usage.used < ctx.usage.limit).goTo('Reserve')
   *    .otherwise().goTo('Reject'))
   */
  branch(name: string, build: (b: BranchBuilder<TContext, TDeps>) => void): this;
  branch(
    name: string,
    options: NamedOptions,
    build: (b: BranchBuilder<TContext, TDeps>) => void,
  ): this;
  branch(
    name: string,
    optionsOrBuild: NamedOptions | ((b: BranchBuilder<TContext, TDeps>) => void),
    maybeBuild?: (b: BranchBuilder<TContext, TDeps>) => void,
  ): this {
    const { options, build } = normalizeCallback(optionsOrBuild, maybeBuild);
    const builder = new BranchBuilder<TContext, TDeps>(name, options);
    build(builder);
    this.requireStage('branch').steps.push({
      kind: 'branch',
      branch: builder.build(),
    });
    return this;
  }

  /**
   * Run several operations concurrently in a {@link ParallelBuilder} section.
   *
   * **What:** runs the section's operations at the same time. Default mode is
   * `failFast` (reject on first error); `collectAll` runs all and aggregates
   * errors; `concurrency(n)` bounds simultaneity.
   *
   * **When to use:** for independent I/O that can overlap - loading membership,
   * subscription, and usage together; firing side effects on finalize.
   *
   * **Why:** cuts latency for independent work while keeping the intent obvious.
   * `validate()` warns on `PARALLEL_WRITE_CONFLICT` if two ops declare the same
   * `writes()` path, since context is shared.
   */
  parallel(
    name: string,
    build: (p: ParallelBuilder<TContext, TDeps>) => void,
  ): this;
  parallel(
    name: string,
    options: NamedOptions,
    build: (p: ParallelBuilder<TContext, TDeps>) => void,
  ): this;
  parallel(
    name: string,
    optionsOrBuild:
      | NamedOptions
      | ((p: ParallelBuilder<TContext, TDeps>) => void),
    maybeBuild?: (p: ParallelBuilder<TContext, TDeps>) => void,
  ): this {
    const { options, build } = normalizeCallback(optionsOrBuild, maybeBuild);
    const builder = new ParallelBuilder<TContext, TDeps>(name, options);
    build(builder);
    this.requireStage('parallel').steps.push({
      kind: 'parallel',
      parallel: builder.build(),
    });
    return this;
  }

  /**
   * Add a bounded loop via a {@link RepeatBuilder} section.
   *
   * **What:** repeatedly runs the loop body until `stopWhen` is satisfied, or
   * `maxAttempts`/`timeBudgetMs` is reached, or a branch signals `stopRepeat`.
   *
   * **When to use:** retrying/searching/generating until a condition holds -
   * candidate-generation, polling with a budget, best-of-N selection.
   *
   * **Why:** loops are first-class and explicitly bounded, so intentional
   * iteration is safe and readable - unlike `goTo` cycles, which are disallowed.
   *
   * @example
   * .repeat('Generate', r =>
   *   r.maxAttempts(500).stopWhen('perfect', ctx => ctx.bestScore === 0)
   *    .do(buildCandidate).do(score))
   */
  repeat(
    name: string,
    build: (r: RepeatBuilder<TContext, TDeps>) => void,
  ): this;
  repeat(
    name: string,
    options: NamedOptions,
    build: (r: RepeatBuilder<TContext, TDeps>) => void,
  ): this;
  repeat(
    name: string,
    optionsOrBuild: NamedOptions | ((r: RepeatBuilder<TContext, TDeps>) => void),
    maybeBuild?: (r: RepeatBuilder<TContext, TDeps>) => void,
  ): this {
    const { options, build } = normalizeCallback(optionsOrBuild, maybeBuild);
    const builder = new RepeatBuilder<TContext, TDeps>(name, options);
    build(builder);
    this.requireStage('repeat').steps.push({
      kind: 'repeat',
      repeat: builder.build(),
    });
    return this;
  }

  /**
   * Begin the compensation section. Operations added after this with `.do()`
   * run **only when the main flow fails**, in declared order.
   *
   * **When to use:** to undo partial work after a failure - release a
   * reservation, void a charge, write a failure audit log (the saga pattern).
   *
   * **Why:** compensations are best-effort: their errors are collected into
   * `compensationErrors` and never hide the original error. Keep them
   * idempotent. Distinct from `finally()`, which always runs.
   */
  onFailure(): this {
    this._section = 'onFailure';
    this._current = undefined;
    return this;
  }

  /**
   * Begin the cleanup section. Operations added after this with `.do()` run
   * **after success or failure**, in declared order.
   *
   * **When to use:** to release resources regardless of outcome - close temp
   * files, release locks, end sessions.
   *
   * **Why:** finally errors are collected into `finallyErrors` (kept separate
   * from compensation errors) and never hide a primary error. If the main flow
   * succeeded but a finally step throws, the result becomes `ok: false` with
   * `failureKind: 'finally_failed'` while the resolved `output` is preserved.
   */
  finally(): this {
    this._section = 'finally';
    this._current = undefined;
    return this;
  }

  /**
   * Finalize the flow with an output resolver, returning a runnable
   * {@link ExecutableFlow}.
   *
   * **What:** the resolver runs only after the main flow succeeds and computes
   * the value placed on `result.output`. May be sync or async.
   *
   * **When to use:** as the last call in (almost) every flow, to shape the
   * response/return value from the final context.
   *
   * **Why:** keeps "what this operation returns" in one obvious place at the
   * bottom of the flow.
   */
  output(
    resolver: (ctx: TContext) => TOutput | Promise<TOutput>,
  ): ExecutableFlow<TContext, TOutput, TDeps> {
    return createExecutableFlow(this.toDefinition(resolver));
  }

  /**
   * Finalize the flow **without** an output resolver (result.output is
   * undefined), returning a runnable {@link ExecutableFlow}.
   *
   * **When to use:** for fire-and-forget flows whose value is the side effects,
   * not a return value (e.g. background jobs).
   *
   * **Why:** an explicit terminator for flows that intentionally produce no
   * output. Prefer `output()` when there is a meaningful return value.
   */
  build(): ExecutableFlow<TContext, TOutput, TDeps> {
    return createExecutableFlow(this.toDefinition(undefined));
  }

  private toDefinition(
    resolver: ((ctx: TContext) => TOutput | Promise<TOutput>) | undefined,
  ): FlowDefinition<TContext, TOutput, TDeps> {
    const stages: StageDefinition<TContext, TDeps>[] = this._stages.map((s) => ({
      id: s.id,
      name: s.name,
      metadata: s.metadata,
      tags: s.tags,
      steps: s.steps,
    }));
    return {
      name: this._name,
      version: this._version,
      metadata: this._metadata,
      tags: this._tags,
      stages,
      onFailure: this._onFailure,
      finally: this._finally,
      output: resolver,
      redact: this._redact,
    };
  }

  private requireStage(op: string): MutableStage<TContext, TDeps> {
    if (this._section !== 'stages' || !this._current) {
      throw new FlowError({
        message: `Cannot call .${op}() outside a stage. Open a stage with .stage(name) first.`,
        code: 'FLOW_NO_CURRENT_STAGE',
      });
    }
    return this._current;
  }
}

function normalizeCallback<TBuilder>(
  optionsOrBuild: NamedOptions | ((b: TBuilder) => void),
  maybeBuild?: (b: TBuilder) => void,
): { options?: NamedOptions; build: (b: TBuilder) => void } {
  if (typeof optionsOrBuild === 'function') {
    return { build: optionsOrBuild };
  }
  return { options: optionsOrBuild, build: maybeBuild! };
}

/**
 * Create a top-level business flow - the entry point of the Pathline authoring
 * API.
 *
 * **What:** returns a {@link FlowBuilder} you compose top-down into stages,
 * guards, branches, parallel sections, loops, compensation, and cleanup, then
 * finalize with `.output()` (or `.build()`).
 *
 * **When to use:** to model any non-trivial application operation you want to
 * read, test, trace, and visualize in one place (auth+billing gates, checkout,
 * provisioning, paid feature execution, imports, background jobs, ...).
 *
 * **Why:** the flow root is the readable business map; each leaf
 * {@link operation} stays isolated. Open one file and understand what runs
 * first, what is checked, where it branches, what runs in parallel, what
 * happens on failure, and what is returned.
 *
 * @typeParam TContext - mutable state threaded through the flow.
 * @typeParam TOutput  - value produced by `output()`.
 * @typeParam TDeps    - injected services passed to handlers/guards.
 *
 * @example
 * const f = flow<Ctx, Out>('My operation')
 *   .stage('Request').do(parse)
 *   .stage('Execute').do(run)
 *   .output(ctx => ctx.response);
 */
export function flow<TContext = any, TOutput = unknown, TDeps = any>(
  name: string,
): FlowBuilder<TContext, TOutput, TDeps> {
  return new FlowBuilder<TContext, TOutput, TDeps>(name);
}
