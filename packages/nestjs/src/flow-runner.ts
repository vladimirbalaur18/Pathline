/* eslint-disable @typescript-eslint/no-explicit-any */
import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  ExecutableFlow,
  FlowRunOptions,
  FlowRunResult,
} from '@pathline/core';
import { PATHLINE_OPTIONS, type PathlineModuleOptions } from './tokens.js';

/**
 * Injectable wrapper around the core flow runtime.
 *
 * **What:** runs an {@link ExecutableFlow} and applies module-level defaults
 * (tracing, `maxSteps`, hooks, `onTrace`) configured in `PathlineModule.forRoot`.
 *
 * **When to use:** inject it into controllers/services to execute flows; for
 * request-scoped dependencies use {@link RequestScopedFlowRunner} instead.
 *
 * **Why:** centralizes run defaults so every flow execution gets consistent
 * tracing/limits without repeating options at each call site.
 */
@Injectable()
export class FlowRunner {
  constructor(
    @Optional()
    @Inject(PATHLINE_OPTIONS)
    private readonly options: PathlineModuleOptions = {},
  ) {}

  /**
   * Run a flow with the given initial context, merging module defaults with any
   * per-call `options` (per-call values win).
   *
   * **Why:** returns a structured {@link FlowRunResult} (does not throw for
   * business failures), so controllers can map `result.error` to a response.
   */
  async run<TContext, TOutput, TDeps>(
    flow: ExecutableFlow<TContext, TOutput, TDeps>,
    initialContext: Partial<TContext>,
    options?: FlowRunOptions<TContext>,
  ): Promise<FlowRunResult<TOutput>> {
    return flow.run(initialContext, this.mergeOptions(options));
  }

  protected mergeOptions<TContext>(
    options?: FlowRunOptions<TContext>,
  ): FlowRunOptions<TContext> {
    const base: FlowRunOptions<TContext> = {
      maxSteps: this.options.maxSteps,
      hooks: this.options.hooks,
      onTrace: this.options.tracing === false ? undefined : this.options.onTrace,
      logger: this.options.logger,
    };
    return { ...base, ...options };
  }
}
