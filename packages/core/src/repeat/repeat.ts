/* eslint-disable @typescript-eslint/no-explicit-any */
import { slugify } from '../internal/ids.js';
import { BranchBuilder } from '../branch/branch.js';
import { ParallelBuilder } from '../parallel/parallel.js';
import type {
  FlowErrorInput,
  GuardDefinition,
  NamedOptions,
  OperationDefinition,
  RepeatDefinition,
  RepeatStopCondition,
  Step,
} from '../types.js';

/**
 * Fluent builder for a bounded loop, passed to the callback of
 * {@link FlowBuilder.repeat}.
 *
 * **What:** defines a loop body that repeats until a `stopWhen` condition holds,
 * a `maxAttempts`/`timeBudgetMs` bound is reached, or a branch action signals
 * `stopRepeat`/`continueRepeat`.
 *
 * **When to use:** for intentional iteration - retry/search/generate loops,
 * best-of-N selection, bounded polling.
 *
 * **Why:** loops are first-class and explicitly bounded here, so iteration is
 * safe and readable. `goTo` cycles are disallowed by design; use `repeat()`.
 * A repeat **must** declare at least one of `maxAttempts`/`timeBudgetMs`
 * (enforced by `validate()`), and the global `maxSteps` ceiling is a final
 * backstop against runaway loops.
 */
export class RepeatBuilder<TContext = any, TDeps = any> {
  private readonly _id: string;
  private readonly _name: string;
  private _maxAttempts?: number;
  private _timeBudgetMs?: number;
  private readonly _stopConditions: RepeatStopCondition<TContext>[] = [];
  private readonly _body: Step<TContext, TDeps>[] = [];

  constructor(name: string, options?: NamedOptions) {
    this._name = name;
    this._id = options?.id ?? slugify(name);
  }

  /**
   * Cap the number of iterations.
   *
   * **When to use:** essentially always - to guarantee the loop terminates.
   *
   * **Why:** a hard upper bound on attempts. Either this or `timeBudgetMs` is
   * required for a valid repeat.
   */
  maxAttempts(n: number): this {
    this._maxAttempts = n;
    return this;
  }

  /**
   * Cap the total wall-clock time spent looping, in milliseconds (checked
   * between iterations).
   *
   * **When to use:** for time-boxed search/optimization where you want the best
   * result found within a budget.
   *
   * **Why:** bounds latency regardless of attempt count. Either this or
   * `maxAttempts` is required for a valid repeat.
   */
  timeBudgetMs(ms: number): this {
    this._timeBudgetMs = ms;
    return this;
  }

  /**
   * Stop the loop (before the next iteration) when `predicate(ctx)` is true.
   *
   * **When to use:** for the "good enough / done" success condition (e.g.
   * `ctx.bestScore === 0`).
   *
   * **Why:** lets the loop exit early on success; the named condition is shown
   * in `describe()`. Multiple stop conditions can be added.
   */
  stopWhen(name: string, predicate: (ctx: TContext) => boolean): this {
    this._stopConditions.push({ name, predicate });
    return this;
  }

  /**
   * Add an {@link operation} to the loop body.
   *
   * **When to use:** for each step performed every iteration (reset state, build
   * a candidate, score it).
   *
   * **Why:** the body is a normal step list, so the same isolated operations are
   * reused inside loops.
   */
  do(operation: OperationDefinition<TContext, TDeps>): this {
    this._body.push({ kind: 'operation', operation });
    return this;
  }

  /**
   * Add a {@link guard} to the loop body.
   *
   * **When to use:** to enforce a per-iteration precondition.
   *
   * **Why:** reuses the same guard semantics inside loops; a denial fails the
   * flow as usual.
   */
  guard(guard: GuardDefinition<TContext, TDeps>): this {
    this._body.push({ kind: 'guard', guard });
    return this;
  }

  /**
   * Add a stage jump inside the loop body (exits the loop and routes to the
   * named stage).
   *
   * **When to use:** to leave the loop early toward a specific stage when a
   * condition is met.
   *
   * **Why:** allows the loop to hand off to the rest of the flow.
   */
  goTo(stageName: string): this {
    this._body.push({ kind: 'goto', stageName });
    return this;
  }

  /**
   * Fail the flow from within the loop body.
   *
   * **When to use:** for a terminal error condition discovered mid-loop.
   *
   * **Why:** concise in-loop rejection; pass `statusCode` for an HTTP-mappable
   * error.
   */
  fail(error: FlowErrorInput): this {
    this._body.push({ kind: 'fail', error });
    return this;
  }

  /**
   * Add a {@link BranchBuilder branch} inside the loop body.
   *
   * **When to use:** to react to the current iteration - e.g. continue on an
   * invalid candidate, stop when one is acceptable.
   *
   * **Why:** branch actions `continueRepeat`/`stopRepeat` are the idiomatic way
   * to control the loop based on context.
   */
  branch(
    name: string,
    build: (b: BranchBuilder<TContext, TDeps>) => void,
  ): this;
  branch(
    name: string,
    options: NamedOptions,
    build: (b: BranchBuilder<TContext, TDeps>) => void,
  ): this;
  branch(
    name: string,
    optionsOrBuild:
      | NamedOptions
      | ((b: BranchBuilder<TContext, TDeps>) => void),
    maybeBuild?: (b: BranchBuilder<TContext, TDeps>) => void,
  ): this {
    const { options, build } = normalize(optionsOrBuild, maybeBuild);
    const builder = new BranchBuilder<TContext, TDeps>(name, options);
    build(builder);
    this._body.push({ kind: 'branch', branch: builder.build() });
    return this;
  }

  /**
   * Add a {@link ParallelBuilder parallel} section inside the loop body.
   *
   * **When to use:** when each iteration performs independent work that can
   * overlap.
   *
   * **Why:** composes concurrency within iteration for lower per-attempt
   * latency.
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
    const { options, build } = normalize(optionsOrBuild, maybeBuild);
    const builder = new ParallelBuilder<TContext, TDeps>(name, options);
    build(builder);
    this._body.push({ kind: 'parallel', parallel: builder.build() });
    return this;
  }

  /** @internal */
  build(): RepeatDefinition<TContext, TDeps> {
    return {
      id: this._id,
      name: this._name,
      maxAttempts: this._maxAttempts,
      timeBudgetMs: this._timeBudgetMs,
      stopConditions: this._stopConditions,
      body: this._body,
    };
  }
}

function normalize<TBuilder>(
  optionsOrBuild: NamedOptions | ((b: TBuilder) => void),
  maybeBuild?: (b: TBuilder) => void,
): { options?: NamedOptions; build: (b: TBuilder) => void } {
  if (typeof optionsOrBuild === 'function') {
    return { build: optionsOrBuild };
  }
  return { options: optionsOrBuild, build: maybeBuild! };
}
