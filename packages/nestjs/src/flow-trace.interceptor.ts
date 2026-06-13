/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  Optional,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PATHLINE_OPTIONS, type PathlineModuleOptions } from './tokens.js';

/**
 * Optional NestJS interceptor that logs flow-run results.
 *
 * **What:** when a handler returns a value that looks like a
 * {@link FlowRunResult} (has `runId` + `flowName`), it logs a concise summary
 * via the configured logger.
 *
 * **When to use:** attach with `@UseInterceptors(FlowTraceInterceptor)` to
 * handlers that return the raw run result, for lightweight request correlation.
 *
 * **Why:** a thin, optional observability hook - your `onTrace`/hooks remain the
 * primary mechanism for detailed tracing.
 */
@Injectable()
export class FlowTraceInterceptor implements NestInterceptor {
  constructor(
    @Optional()
    @Inject(PATHLINE_OPTIONS)
    private readonly options: PathlineModuleOptions = {},
  ) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap((value: any) => {
        if (value && typeof value === 'object' && 'runId' in value && 'flowName' in value) {
          this.options.logger?.info?.('pathline.flow.completed', {
            flowName: value.flowName,
            runId: value.runId,
            ok: value.ok,
            durationMs: value.durationMs,
          });
        }
      }),
    );
  }
}
