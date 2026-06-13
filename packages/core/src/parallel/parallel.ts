/* eslint-disable @typescript-eslint/no-explicit-any */
import { slugify } from '../internal/ids.js';
import type {
  NamedOptions,
  OperationDefinition,
  ParallelDefinition,
  ParallelMode,
} from '../types.js';

/**
 * Fluent builder for a parallel section, passed to the callback of
 * {@link FlowBuilder.parallel}.
 *
 * **What:** collects operations to run concurrently, plus an optional failure
 * `mode` and `concurrency` limit.
 *
 * **When to use:** for independent work that can overlap to reduce latency
 * (e.g. loading several resources at once, firing multiple side effects).
 *
 * **Why:** explicit concurrency in the flow map; because operations share the
 * context, `validate()` warns on `PARALLEL_WRITE_CONFLICT` when two declare the
 * same `writes()` key.
 */
export class ParallelBuilder<TContext = any, TDeps = any> {
  private readonly _id: string;
  private readonly _name: string;
  private _mode: ParallelMode = 'failFast';
  private _concurrency?: number;
  private readonly _operations: OperationDefinition<TContext, TDeps>[] = [];

  constructor(name: string, options?: NamedOptions) {
    this._name = name;
    this._id = options?.id ?? slugify(name);
  }

  /**
   * Set the failure mode: `'failFast'` (default) rejects as soon as one
   * operation throws; `'collectAll'` runs every operation and aggregates all
   * errors.
   *
   * **When to use:** `failFast` for "all must succeed" gates; `collectAll` for
   * best-effort fan-out (e.g. finalize side effects) where you want to know
   * every failure.
   *
   * **Why:** lets you choose between fail-early latency and complete-error
   * visibility.
   */
  mode(mode: ParallelMode): this {
    this._mode = mode;
    return this;
  }

  /**
   * Cap how many operations run at once (default: unbounded).
   *
   * **When to use:** to avoid overwhelming a downstream (rate limits, connection
   * pools) when the section has many operations.
   *
   * **Why:** bounds resource pressure while still overlapping work.
   */
  concurrency(limit: number): this {
    this._concurrency = limit;
    return this;
  }

  /**
   * Add an {@link operation} to run as part of this parallel section.
   *
   * **When to use:** once per concurrent unit of work.
   *
   * **Why:** the same isolated, testable operations compose into concurrent
   * sections without special-casing.
   */
  do(operation: OperationDefinition<TContext, TDeps>): this {
    this._operations.push(operation);
    return this;
  }

  /** @internal */
  build(): ParallelDefinition<TContext, TDeps> {
    return {
      id: this._id,
      name: this._name,
      mode: this._mode,
      concurrency: this._concurrency,
      operations: this._operations,
    };
  }
}
