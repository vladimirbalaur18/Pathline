import {
  type DynamicModule,
  Logger as NestLogger,
  Module,
  type OnModuleInit,
} from '@nestjs/common';
import { FlowValidationError } from '@pathline/core';
import { FlowRunner } from './flow-runner.js';
import { RequestScopedFlowRunner } from './request-scoped-flow-runner.js';
import { FlowHttpExceptionFilter } from './flow-exception.filter.js';
import { FlowTraceInterceptor } from './flow-trace.interceptor.js';
import { PATHLINE_OPTIONS, type PathlineModuleOptions } from './tokens.js';

/**
 * Root module that wires Pathline into a NestJS application.
 *
 * **What:** `forRoot(options)` returns a global module that provides and exports
 * {@link FlowRunner}, {@link RequestScopedFlowRunner},
 * {@link FlowHttpExceptionFilter}, and {@link FlowTraceInterceptor}, and can
 * validate registered flows at bootstrap.
 *
 * **When to use:** import once in your `AppModule`.
 *
 * **Why:** NestJS keeps owning routing, DI, filters, and interceptors; Pathline
 * stays a thin adapter that supplies the runner and optional helpers - it does
 * not replace any Nest concept.
 */
@Module({})
export class PathlineModule implements OnModuleInit {
  private static bootstrapOptions: PathlineModuleOptions = {};

  /**
   * Configure and register the Pathline providers as a global module.
   *
   * **When to use:** in `AppModule.imports`, e.g.
   * `PathlineModule.forRoot({ tracing: true })`.
   *
   * **Why:** sets run defaults (tracing/maxSteps/hooks/onTrace) once for the
   * whole app and optionally validates a {@link FlowRegistry} at boot via
   * `validateOnBootstrap`.
   */
  static forRoot(options: PathlineModuleOptions = {}): DynamicModule {
    PathlineModule.bootstrapOptions = options;
    return {
      module: PathlineModule,
      global: true,
      providers: [
        { provide: PATHLINE_OPTIONS, useValue: options },
        FlowRunner,
        RequestScopedFlowRunner,
        FlowHttpExceptionFilter,
        FlowTraceInterceptor,
      ],
      exports: [
        PATHLINE_OPTIONS,
        FlowRunner,
        RequestScopedFlowRunner,
        FlowHttpExceptionFilter,
        FlowTraceInterceptor,
      ],
    };
  }

  onModuleInit(): void {
    const options = PathlineModule.bootstrapOptions;
    if (!options.validateOnBootstrap || !options.registry) return;

    const strict = options.validationMode !== 'warn';
    const logger = new NestLogger('Pathline');
    try {
      const result = options.registry.validateAll({ strict });
      if (!result.ok && !strict) {
        for (const [name, flowResult] of Object.entries(result.byFlow)) {
          for (const issue of [...flowResult.errors, ...flowResult.warnings]) {
            logger.warn(`[${name}] ${issue.code}: ${issue.message}`);
          }
        }
      }
    } catch (err) {
      if (err instanceof FlowValidationError) {
        logger.error(`Flow validation failed: ${err.message}`);
      }
      throw err;
    }
  }
}
