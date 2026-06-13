/* eslint-disable @typescript-eslint/no-explicit-any */
import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
import type {
  ExecutableFlow,
  FlowRunOptions,
  FlowRunResult,
} from '@pathline/core';
import { FlowRunner } from './flow-runner.js';
import { PATHLINE_OPTIONS, type PathlineModuleOptions } from './tokens.js';

/**
 * Request-scoped runner for flows whose dependencies are request-scoped.
 *
 * **What:** binds per-request deps via `flow.withDependencies(deps)` right
 * before running, then executes with module defaults.
 *
 * **When to use:** when a dependency is `Scope.REQUEST` (reads the current
 * request/tenant). Use the singleton {@link FlowRunner} when all deps are
 * singletons.
 *
 * **Why:** building a flow with a singleton `useFactory` would capture the wrong
 * (stale) instance of a request-scoped provider; binding per request ensures
 * each execution uses its own provider instances (and re-validates deps).
 */
@Injectable({ scope: Scope.REQUEST })
export class RequestScopedFlowRunner extends FlowRunner {
  constructor(
    @Optional()
    @Inject(PATHLINE_OPTIONS)
    options: PathlineModuleOptions = {},
  ) {
    super(options);
  }

  /**
   * Bind `deps` to the flow for this request, then run it.
   *
   * **When to use:** with a flow built **without** bound deps (finished via
   * `output()`/`build()`), passing the request-scoped services here.
   *
   * **Why:** `withDependencies(deps)` validates and binds per request, so the
   * run uses the correct per-request instances.
   */
  async runWith<TContext, TOutput, TDeps>(
    flow: ExecutableFlow<TContext, TOutput, TDeps>,
    deps: TDeps,
    initialContext: Partial<TContext>,
    options?: FlowRunOptions<TContext>,
  ): Promise<FlowRunResult<TOutput>> {
    return this.run(flow.withDependencies(deps), initialContext, options);
  }
}
