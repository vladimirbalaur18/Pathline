import type { FlowFailureKind, FlowValidationIssue, SerializedFlowError } from '../types.js';

export interface FlowErrorOptions {
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * Base error for all Pathline business failures.
 *
 * **When to use:** throw from a handler/guard for a domain failure that is not
 * inherently HTTP (otherwise prefer {@link FlowHttpError}).
 *
 * **Why:** carries a machine-readable `code` and structured `details` so the
 * runtime can serialize it safely into the result and trace.
 */
export class FlowError extends Error {
  code?: string;
  details?: unknown;

  constructor(options: FlowErrorOptions) {
    super(options.message);
    this.name = 'FlowError';
    this.code = options.code;
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface FlowHttpErrorOptions {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * HTTP-oriented error carrying a status code.
 *
 * **When to use:** throw from handlers/guards in HTTP apps to express failures
 * with a specific status (e.g. `402 BILLING_INACTIVE`, `404 NOT_FOUND`).
 *
 * **Why:** the {@link FlowHttpExceptionFilter} (in `@pathline/nestjs`) maps it
 * to `{ statusCode, code, message, details }`, so domain failures become correct
 * HTTP responses without extra plumbing.
 */
export class FlowHttpError extends FlowError {
  statusCode: number;

  constructor(options: FlowHttpErrorOptions) {
    super({
      message: options.message,
      code: options.code,
      details: options.details,
    });
    this.name = 'FlowHttpError';
    this.statusCode = options.statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised when structural validation fails in throwing mode (e.g.
 * `FlowRegistry.validateAll({ strict: true })` or duplicate flow names).
 *
 * **Why:** carries the full list of {@link FlowValidationIssue} on `issues` so
 * startup checks can report exactly what is wrong.
 */
export class FlowValidationError extends FlowError {
  issues: FlowValidationIssue[];

  constructor(message: string, issues: FlowValidationIssue[]) {
    super({ message, code: 'FLOW_VALIDATION_FAILED', details: issues });
    this.name = 'FlowValidationError';
    this.issues = issues;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised by the runtime when an operation exceeds its `timeoutMs`.
 *
 * **Why:** distinguishes timeouts from other failures - the run reports
 * `failureKind: 'timeout'`. You normally do not throw this yourself.
 */
export class FlowTimeoutError extends FlowError {
  timeoutMs: number;

  constructor(operationName: string, timeoutMs: number) {
    super({
      message: `Operation "${operationName}" timed out after ${timeoutMs}ms`,
      code: 'FLOW_OPERATION_TIMEOUT',
    });
    this.name = 'FlowTimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised by the runtime when a run is aborted via its `AbortSignal`.
 *
 * **Why:** distinguishes cancellation from real errors - the run reports
 * `failureKind: 'cancelled'` and a canceled attempt is never retried. You
 * normally do not throw this yourself.
 */
export class FlowCancelledError extends FlowError {
  constructor(message = 'Flow run was cancelled') {
    super({ message, code: 'FLOW_CANCELLED' });
    this.name = 'FlowCancelledError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const isProduction = (): boolean =>
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

/**
 * Convert any thrown value into a safe, structured {@link SerializedFlowError}.
 *
 * **When to use:** mostly internal (the runtime uses it to populate
 * `result.error`), but handy if you persist or forward errors yourself.
 *
 * **Why:** produces a consistent shape (`name`, `message`, `code`, `statusCode`,
 * `details`, `failureKind`) and omits stack traces in production
 * (`NODE_ENV === 'production'`) to avoid leaking internals.
 */
export function serializeError(
  error: unknown,
  failureKind?: FlowFailureKind,
): SerializedFlowError {
  if (error instanceof FlowError) {
    const serialized: SerializedFlowError = {
      name: error.name,
      message: error.message,
      code: error.code,
      details: error.details,
      failureKind,
    };
    if (error instanceof FlowHttpError) {
      serialized.statusCode = error.statusCode;
    }
    if (!isProduction() && error.stack) {
      serialized.stack = error.stack;
    }
    return serialized;
  }

  if (error instanceof Error) {
    const serialized: SerializedFlowError = {
      name: error.name,
      message: error.message,
      failureKind,
    };
    if (!isProduction() && error.stack) {
      serialized.stack = error.stack;
    }
    return serialized;
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : 'Unknown error',
    details: error,
    failureKind,
  };
}
