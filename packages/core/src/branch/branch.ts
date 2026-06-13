/* eslint-disable @typescript-eslint/no-explicit-any */
import { slugify } from '../internal/ids.js';
import { FlowError } from '../errors/index.js';
import type {
  BranchCase,
  BranchDefinition,
  FlowErrorInput,
  NamedOptions,
  OperationDefinition,
} from '../types.js';

/**
 * Fluent builder for a conditional branch, passed to the callback of
 * {@link FlowBuilder.branch}.
 *
 * **What:** you declare cases as `when(name, predicate)` (or `otherwise()`),
 * each immediately followed by exactly one action
 * (`goTo`/`do`/`continueRepeat`/`stopRepeat`/`fail`).
 *
 * **When to use:** to route execution based on the current context.
 *
 * **Why:** the runtime evaluates cases in declaration order and the first match
 * wins (else `otherwise`), and the chosen case is recorded in the trace - so
 * decisions are deterministic and debuggable.
 */
export class BranchBuilder<TContext = any, TDeps = any> {
  private readonly _id: string;
  private readonly _name: string;
  private readonly _cases: BranchCase<TContext, TDeps>[] = [];
  private _pending?: { name: string; predicate?: (ctx: TContext) => boolean };

  constructor(name: string, options?: NamedOptions) {
    this._name = name;
    this._id = options?.id ?? slugify(name);
  }

  /**
   * Begin a named conditional case.
   *
   * **What:** registers a case whose `predicate(ctx)` decides if it matches.
   * Must be followed by one action method before the next `when`/`otherwise`.
   *
   * **When to use:** for each distinct condition you want to handle.
   *
   * **Why:** the name appears in the trace as the selected branch, making "which
   * path was taken and why" obvious.
   */
  when(name: string, predicate: (ctx: TContext) => boolean): this {
    this.ensureNoPending();
    this._pending = { name, predicate };
    return this;
  }

  /**
   * Begin the fallback case used when no `when(...)` predicate matched.
   *
   * **When to use:** to guarantee the branch always resolves (recommended).
   *
   * **Why:** without an `otherwise()` and with no matching case, the runtime
   * fails with `failureKind: 'branch_unmatched'`.
   */
  otherwise(name = 'Otherwise'): this {
    this.ensureNoPending();
    this._pending = { name, predicate: undefined };
    return this;
  }

  /**
   * Action: jump to another stage when this case is selected.
   *
   * **When to use:** to route between named stages (the most common action).
   *
   * **Why:** keeps multi-way routing readable - each case points at a stage.
   */
  goTo(stageName: string): this {
    return this.commit({ kind: 'goto', stageName });
  }

  /**
   * Action: run a single inline {@link operation} when this case is selected,
   * then continue with the next step.
   *
   * **When to use:** for a small conditional side effect that does not warrant a
   * dedicated stage (e.g. "keep first usable fallback").
   *
   * **Why:** avoids creating awkward micro-stages for one-off conditional work.
   */
  do(operation: OperationDefinition<TContext, TDeps>): this {
    return this.commit({ kind: 'do', operation });
  }

  /**
   * Action: skip to the next iteration of the enclosing {@link RepeatBuilder}
   * loop.
   *
   * **When to use:** inside a `repeat()` body to discard the current candidate
   * and try again.
   *
   * **Why:** expresses loop "continue" declaratively. Only valid inside a
   * repeat (otherwise `validate()` flags `REPEAT_SIGNAL_OUTSIDE_REPEAT`).
   */
  continueRepeat(): this {
    return this.commit({ kind: 'continueRepeat' });
  }

  /**
   * Action: stop the enclosing {@link RepeatBuilder} loop and move on.
   *
   * **When to use:** inside a `repeat()` body when a terminal condition is hit
   * (e.g. candidate generation failed, or a good-enough result was found).
   *
   * **Why:** expresses loop "break" declaratively. Only valid inside a repeat.
   */
  stopRepeat(): this {
    return this.commit({ kind: 'stopRepeat' });
  }

  /**
   * Action: fail the flow with a structured error when this case is selected.
   *
   * **When to use:** to reject inline without routing to a separate `fail`
   * stage.
   *
   * **Why:** concise terminal rejection; pass `statusCode` to produce a
   * {@link FlowHttpError} mappable to an HTTP response.
   */
  fail(error: FlowErrorInput): this {
    return this.commit({ kind: 'fail', error });
  }

  private ensureNoPending(): void {
    if (this._pending) {
      throw new FlowError({
        message: `Branch "${this._name}" case "${this._pending.name}" has no action; call goTo/do/continueRepeat/stopRepeat/fail before the next when/otherwise`,
        code: 'FLOW_BRANCH_CASE_INCOMPLETE',
      });
    }
  }

  private commit(action: BranchCase<TContext, TDeps>['action']): this {
    if (!this._pending) {
      throw new FlowError({
        message: `Branch "${this._name}" action declared before when()/otherwise()`,
        code: 'FLOW_BRANCH_ACTION_WITHOUT_CASE',
      });
    }
    this._cases.push({
      name: this._pending.name,
      predicate: this._pending.predicate,
      action,
    });
    this._pending = undefined;
    return this;
  }

  /** @internal */
  build(): BranchDefinition<TContext, TDeps> {
    this.ensureNoPending();
    return { id: this._id, name: this._name, cases: this._cases };
  }
}
