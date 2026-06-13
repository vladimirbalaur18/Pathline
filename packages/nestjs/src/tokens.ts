import type {
  FlowRegistry,
  FlowRuntimeHooks,
  FlowTraceEvent,
  Logger,
} from '@pathline/core';

/** DI token for {@link PathlineModuleOptions} (injected into the runner). */
export const PATHLINE_OPTIONS = Symbol('PATHLINE_OPTIONS');

/**
 * Options for {@link PathlineModule.forRoot}.
 *
 * **Why:** these become the default run options applied by {@link FlowRunner}
 * across the app, plus optional boot-time validation - configure once instead of
 * at every call site.
 */
export interface PathlineModuleOptions {
  /** Enable trace recording for runs executed via FlowRunner. */
  tracing?: boolean;
  /** Include trace/debug info in thrown/returned errors. */
  exposeDebugInfo?: boolean;
  /** Default maxSteps for runs executed via FlowRunner. */
  maxSteps?: number;
  /** Logger used by the trace interceptor and bootstrap validation. */
  logger?: Logger;
  /** Default lifecycle hooks applied to every run. */
  hooks?: FlowRuntimeHooks;
  /** Default trace sink applied to every run (e.g. forward to OTel/logs). */
  onTrace?: (event: FlowTraceEvent) => void | Promise<void>;
  /** Validate all registered flows during module init. */
  validateOnBootstrap?: boolean;
  /** How to treat validation problems at bootstrap (`error` throws). */
  validationMode?: 'error' | 'warn';
  /** Registry validated at bootstrap when validateOnBootstrap is set. */
  registry?: FlowRegistry;
}
