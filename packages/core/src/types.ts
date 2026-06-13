/**
 * Core shared types for Pathline.
 *
 * Pathline v1 is an in-process flow orchestrator (not a durable workflow
 * engine): if the process crashes mid-flow it does not resume automatically.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type FlowStatus = 'completed' | 'failed';

export type OperationStatus =
  | 'pending'
  | 'started'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Machine-readable category of why a flow failed (on `FlowRunResult.failureKind`).
 *
 * **When to use:** to map failures to HTTP statuses/metrics without matching on
 * error messages.
 *
 * **Why:** stable categories survive message changes and i18n.
 *
 * - `operation_failed` - a leaf operation threw.
 * - `guard_denied` - a guard's `check` returned false.
 * - `branch_unmatched` - no branch case matched and there was no `otherwise()`.
 * - `validation_failed` - structural validation failed.
 * - `timeout` - an operation exceeded its `timeoutMs`.
 * - `cancelled` - the run was aborted via `AbortSignal`.
 * - `max_steps_exceeded` - the global step ceiling was hit (runaway guard).
 * - `compensation_failed` - an onFailure step threw (primary error preserved).
 * - `finally_failed` - the main flow succeeded but a finally step threw.
 * - `internal_error` - an unexpected framework-level error.
 */
export type FlowFailureKind =
  | 'operation_failed'
  | 'guard_denied'
  | 'branch_unmatched'
  | 'validation_failed'
  | 'timeout'
  | 'cancelled'
  | 'max_steps_exceeded'
  | 'compensation_failed'
  | 'finally_failed'
  | 'internal_error';

export interface SerializedFlowError {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  failureKind?: FlowFailureKind;
  details?: unknown;
  stack?: string;
}

export type TraceKind =
  | 'flow'
  | 'stage'
  | 'operation'
  | 'guard'
  | 'branch'
  | 'parallel'
  | 'repeat'
  | 'subflow'
  | 'compensation'
  | 'finally'
  | 'output';

export type TraceStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'selected';

export interface FlowTraceEvent {
  flowName: string;
  runId: string;
  stageName?: string;
  operationName?: string;
  nodeId?: string;
  kind: TraceKind;
  status: TraceStatus;
  message?: string;
  selectedBranch?: string;
  attempt?: number;
  attempts?: number;
  childrenPolicy?: 'summary' | 'full';
  error?: SerializedFlowError;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
}

/**
 * The structured result of running a flow (returned by `ExecutableFlow.run`).
 *
 * **Why:** `run()` never throws for business failures - everything you need to
 * understand the outcome (success, error, why it failed, the full timeline,
 * and identifiers for correlation) is here, which makes assertions and logging
 * straightforward.
 */
export interface FlowRunResult<TOutput = unknown> {
  /** `true` if the main flow and any finally steps succeeded. */
  ok: boolean;
  /** The value from `output()` (present only on success). */
  output?: TOutput;
  /** The primary failure, safely serialized (present only on failure). */
  error?: SerializedFlowError;
  /** Machine-readable category of the failure for branching/metrics. */
  failureKind?: FlowFailureKind;
  /** Ordered timeline of everything that happened during the run. */
  trace: FlowTraceEvent[];
  /** Errors thrown by onFailure compensation steps (failure recovery). */
  compensationErrors?: SerializedFlowError[];
  /** Errors thrown by finally cleanup steps (always-run). Kept separate. */
  finallyErrors?: SerializedFlowError[];
  /** Total wall-clock duration of the run, in milliseconds. */
  durationMs: number;
  /** The flow's name. */
  flowName: string;
  /** The flow's `version()`, if set - log it to match traces to code. */
  flowVersion?: string;
  /** Stable hash of the serializable flow structure that ran. */
  definitionHash: string;
  /** Stable id unique to this execution; also on every trace event. */
  runId: string;
}

/**
 * Runtime handle passed to operation handlers as the third argument.
 *
 * **When to use:** read `runtime.signal` and forward it to cancelable external
 * calls; use `runtime.runId` to correlate logs from inside a handler.
 *
 * **Why:** gives handlers controlled access to per-run concerns (cancellation,
 * correlation) without leaking the whole engine.
 */
export interface RuntimeApi {
  /** Abort signal for the run; forward to external calls to support cancel. */
  signal?: AbortSignal;
  /** Stable id of the current execution. */
  runId: string;
}

/** Backoff curve between retries: constant `none`/`fixed`, or `exponential`. */
export type BackoffStrategy = 'none' | 'fixed' | 'exponential';

/**
 * Retry configuration for an operation (see `operation().retry(...)`).
 *
 * **When to use:** for idempotent, transient-failure-prone calls.
 *
 * **Why:** centralizes retry behavior so handlers stay simple; each attempt is
 * traced and a canceled run is never retried.
 */
export interface RetryPolicy {
  /** Total attempts including the first (e.g. `3` = 1 try + 2 retries). */
  attempts: number;
  /** Delay curve between attempts (default: `none`). */
  backoff?: BackoffStrategy;
  /** Base delay in ms (default 50). */
  delayMs?: number;
  /** Return true to retry the given error; defaults to always retry. */
  retryOn?: (error: unknown) => boolean;
}

/**
 * Operation handler. May mutate `ctx` directly OR return a `Partial<TContext>`
 * patch that the runtime shallow-merges into `ctx` after the handler resolves.
 * Returning `undefined` means no patch. If a handler both mutates and returns a
 * patch, both apply and the patch wins on top-level key conflicts.
 */
export type OperationHandler<TContext, TDeps> = (
  ctx: TContext,
  deps: TDeps,
  runtime: RuntimeApi,
) => void | Partial<TContext> | Promise<void | Partial<TContext>>;

/**
 * Options accepted by every named construct (stage/operation/guard/branch/
 * parallel/repeat/subflow).
 *
 * **When to use:** to pin a stable `id` so traces, metrics, and graph diffs
 * survive label renames.
 *
 * **Why:** without an explicit `id`, one is slugified from the name - fine for
 * convenience, but pin it for anything observability/tooling depends on.
 */
export interface NamedOptions {
  /** Stable identifier; defaults to a slug of the name. */
  id?: string;
}

/**
 * String keys of an injected-deps object — use as the `TDeps` type param on
 * `operation()` so `.dependsOn(...)` offers IDE autocomplete for each service.
 */
export type DepKey<TDeps> = keyof TDeps & string;

/**
 * String keys of a flow context object — use as the `TContext` type param on
 * `operation()` so `.reads(...)` / `.writes(...)` offer IDE autocomplete.
 */
export type ContextKey<TContext> = keyof TContext & string;

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

export interface OperationDefinition<TContext = any, TDeps = any> {
  readonly id: string;
  readonly name: string;
  readonly reads: string[];
  readonly writes: string[];
  readonly dependsOn: string[];
  readonly timeoutMs?: number;
  readonly retry?: RetryPolicy;
  readonly metadata?: Record<string, unknown>;
  readonly tags: string[];
  readonly redactTrace?: (ctx: TContext) => unknown;
  readonly handler: OperationHandler<TContext, TDeps>;
  /** Run this operation in isolation (for unit tests). Applies patch merge. */
  run(ctx: TContext, deps: TDeps, runtime?: RuntimeApi): Promise<void>;
}

export interface GuardDefinition<TContext = any, TDeps = any> {
  readonly id: string;
  readonly name: string;
  readonly dependsOn: string[];
  readonly metadata?: Record<string, unknown>;
  readonly tags: string[];
  readonly check: (ctx: TContext, deps: TDeps) => boolean | Promise<boolean>;
  /** Optional custom deny handler; should throw a FlowError/FlowHttpError. */
  readonly deny?: (ctx: TContext, deps: TDeps) => void | Promise<void>;
}

/**
 * Shape of an error declared inline (e.g. `branch.fail({...})`, `stage.fail({...})`).
 *
 * **Why:** providing `statusCode` produces a {@link FlowHttpError} that the
 * NestJS exception filter maps to an HTTP response; omitting it produces a plain
 * {@link FlowError}.
 */
export interface FlowErrorInput {
  /** HTTP status; when set, yields a FlowHttpError. */
  statusCode?: number;
  /** Stable, machine-readable error code (e.g. `QUOTA_EXCEEDED`). */
  code?: string;
  /** Human-readable message. */
  message: string;
  /** Optional extra context (avoid secrets). */
  details?: unknown;
}

/**
 * The action a branch case performs when selected.
 *
 * **Why:** branch cases support more than jumping - they can run an inline
 * operation, control an enclosing loop, or fail - so you avoid creating
 * micro-stages for simple conditional behavior.
 *
 * - `goto` - jump to another stage.
 * - `do` - run one inline operation and continue.
 * - `continueRepeat` / `stopRepeat` - control the enclosing `repeat()` loop.
 * - `fail` - fail the flow with a structured error.
 */
export type BranchAction<TContext = any, TDeps = any> =
  | { kind: 'goto'; stageName: string }
  | { kind: 'do'; operation: OperationDefinition<TContext, TDeps> }
  | { kind: 'continueRepeat' }
  | { kind: 'stopRepeat' }
  | { kind: 'fail'; error: FlowErrorInput };

export interface BranchCase<TContext = any, TDeps = any> {
  name: string;
  /** Undefined predicate means the `otherwise` case. */
  predicate?: (ctx: TContext) => boolean;
  action: BranchAction<TContext, TDeps>;
}

export interface BranchDefinition<TContext = any, TDeps = any> {
  readonly id: string;
  readonly name: string;
  readonly cases: BranchCase<TContext, TDeps>[];
}

export type ParallelMode = 'failFast' | 'collectAll';

export interface ParallelDefinition<TContext = any, TDeps = any> {
  readonly id: string;
  readonly name: string;
  readonly mode: ParallelMode;
  readonly concurrency?: number;
  readonly operations: OperationDefinition<TContext, TDeps>[];
}

export interface RepeatStopCondition<TContext = any> {
  name: string;
  predicate: (ctx: TContext) => boolean;
}

export interface RepeatDefinition<TContext = any, TDeps = any> {
  readonly id: string;
  readonly name: string;
  readonly maxAttempts?: number;
  readonly timeBudgetMs?: number;
  readonly stopConditions: RepeatStopCondition<TContext>[];
  readonly body: Step<TContext, TDeps>[];
}

export interface SubflowDefinition<TContext = any> {
  readonly id: string;
  readonly name: string;
  readonly flow: ExecutableFlow<any, any, any>;
  readonly mapOutput?: (ctx: TContext, output: unknown) => void | Partial<TContext>;
}

export type Step<TContext = any, TDeps = any> =
  | { kind: 'operation'; operation: OperationDefinition<TContext, TDeps> }
  | { kind: 'guard'; guard: GuardDefinition<TContext, TDeps> }
  | { kind: 'branch'; branch: BranchDefinition<TContext, TDeps> }
  | { kind: 'parallel'; parallel: ParallelDefinition<TContext, TDeps> }
  | { kind: 'repeat'; repeat: RepeatDefinition<TContext, TDeps> }
  | { kind: 'goto'; stageName: string }
  | { kind: 'fail'; error: FlowErrorInput }
  | { kind: 'subflow'; subflow: SubflowDefinition<TContext> };

export interface StageDefinition<TContext = any, TDeps = any> {
  readonly id: string;
  readonly name: string;
  readonly metadata?: Record<string, unknown>;
  readonly tags: string[];
  readonly steps: Step<TContext, TDeps>[];
}

export interface FlowDefinition<TContext = any, TOutput = unknown, TDeps = any> {
  readonly name: string;
  readonly version?: string;
  readonly metadata?: Record<string, unknown>;
  readonly tags: string[];
  readonly stages: StageDefinition<TContext, TDeps>[];
  readonly onFailure: OperationDefinition<TContext, TDeps>[];
  readonly finally: OperationDefinition<TContext, TDeps>[];
  readonly output?: (ctx: TContext) => TOutput | Promise<TOutput>;
  readonly redact?: (ctx: TContext) => unknown;
}

/* ------------------------------------------------------------------ */
/* Observability / runtime options                                    */
/* ------------------------------------------------------------------ */

export interface OperationLifecycleEvent<TContext = any> {
  flowName: string;
  runId: string;
  stageName?: string;
  operationName: string;
  nodeId: string;
  status: OperationStatus;
  attempt?: number;
  error?: unknown;
  ctx: TContext;
}

/**
 * Cross-cutting lifecycle callbacks invoked during a run (via run options or
 * the NestJS module).
 *
 * **When to use:** for audit, metrics, request correlation, tenant scoping,
 * logging, and security checks - logic that should wrap many operations.
 *
 * **Why:** keeps cross-cutting concerns out of individual handlers and gives a
 * single place to observe the run.
 */
export interface FlowRuntimeHooks<TContext = any> {
  /** Before the flow body runs (after context is seeded). */
  beforeFlow?: (ctx: TContext) => void | Promise<void>;
  /** After the run completes (success or failure), with the final result. */
  afterFlow?: (ctx: TContext, result: FlowRunResult<unknown>) => void | Promise<void>;
  /** Before each operation/compensation/finally step. */
  beforeOperation?: (e: OperationLifecycleEvent<TContext>) => void | Promise<void>;
  /** After each step settles (completed or failed). */
  afterOperation?: (e: OperationLifecycleEvent<TContext>) => void | Promise<void>;
  /** Alias fired at the very start of the run. */
  onFlowStart?: (ctx: TContext) => void | Promise<void>;
  /** Fired when the run finishes successfully. */
  onFlowComplete?: (ctx: TContext, result: FlowRunResult<unknown>) => void | Promise<void>;
  /** Fired when the run finishes with a failure. */
  onFlowFail?: (ctx: TContext, result: FlowRunResult<unknown>) => void | Promise<void>;
  /** Fired when an operation starts. */
  onOperationStart?: (e: OperationLifecycleEvent<TContext>) => void | Promise<void>;
  /** Fired when an operation completes successfully. */
  onOperationComplete?: (e: OperationLifecycleEvent<TContext>) => void | Promise<void>;
  /** Fired when an operation fails (after retries are exhausted). */
  onOperationFail?: (e: OperationLifecycleEvent<TContext>) => void | Promise<void>;
}

export interface Logger {
  debug?: (message: string, meta?: unknown) => void;
  info?: (message: string, meta?: unknown) => void;
  warn?: (message: string, meta?: unknown) => void;
  error?: (message: string, meta?: unknown) => void;
}

/**
 * Controls how much trace volume a run produces.
 *
 * **When to use:** for search/import/scheduling flows with large `repeat()`
 * loops that would otherwise emit huge traces.
 *
 * **Why:** keeps traces useful and bounded; repeat bodies are summarized by
 * default.
 */
export interface TraceOptions {
  /** Cap total trace events; extra events are dropped (default unbounded). */
  maxEvents?: number;
  /** 'summary' emits one event per repeat block; 'full' keeps each iteration. */
  repeatMode?: 'summary' | 'full';
}

/**
 * Per-run options for `ExecutableFlow.run`.
 *
 * **When to use:** to add cancellation, tune safety/observability, or stream
 * traces for a specific execution.
 *
 * **Why:** keeps the flow definition reusable while letting each run opt into
 * cancellation, hooks, tracing, and limits.
 */
export interface FlowRunOptions<TContext = any> {
  /** Abort signal to cancel the run; forwarded to handlers via `runtime`. */
  signal?: AbortSignal;
  /** Global executed-step ceiling guarding against runaway loops. */
  maxSteps?: number;
  /** Lifecycle callbacks for audit/metrics/correlation. */
  hooks?: FlowRuntimeHooks<TContext>;
  /** Receive each trace event as it is emitted (e.g. forward to OTel/logs). */
  onTrace?: (event: FlowTraceEvent) => void | Promise<void>;
  /** Trace volume controls (size cap, repeat summarization). */
  trace?: TraceOptions;
  logger?: Logger;
}

/* ------------------------------------------------------------------ */
/* Validation + graph                                                 */
/* ------------------------------------------------------------------ */

export interface FlowValidationIssue {
  code: string;
  message: string;
  path?: string[];
  severity: 'error' | 'warning';
}

export interface FlowValidationResult {
  ok: boolean;
  errors: FlowValidationIssue[];
  warnings: FlowValidationIssue[];
}

export type FlowGraphNodeKind =
  | 'flow'
  | 'stage'
  | 'operation'
  | 'guard'
  | 'branch'
  | 'parallel'
  | 'repeat'
  | 'subflow'
  | 'compensation'
  | 'finally'
  | 'output'
  | 'failure';

export interface FlowGraphNode {
  id: string;
  label: string;
  kind: FlowGraphNodeKind;
  metadata?: Record<string, unknown>;
}

export interface FlowGraphEdge {
  from: string;
  to: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface FlowGraph {
  id: string;
  name: string;
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
}

/**
 * A finished, runnable flow produced by `flow(...).output(...)` / `.build()`.
 *
 * **What:** an immutable flow definition plus methods to run, bind
 * dependencies, document, visualize, and validate it.
 *
 * **When to use:** export one per operation; inject it (e.g. into a NestJS
 * controller) and call `run()`, or use it directly in scripts/tests/jobs.
 *
 * **Why:** definitions are reusable and stateless; per-execution data lives in
 * the context you pass to `run()`.
 */
export interface ExecutableFlow<TContext = any, TOutput = unknown, TDeps = any> {
  /** The flow's human-readable name (used in traces and as a registry key). */
  readonly name: string;
  /** The semantic version set via `flow().version(...)`, if any. */
  readonly version?: string;
  /** The underlying serializable definition (stages, sections, metadata). */
  readonly definition: FlowDefinition<TContext, TOutput, TDeps>;
  /**
   * Execute the flow with an initial context and optional run options.
   *
   * **What:** runs all stages top-down and resolves a {@link FlowRunResult}. It
   * does **not** throw for business failures - inspect `result.ok`,
   * `result.error`, `result.failureKind`, and `result.trace`.
   *
   * **When to use:** to actually perform the operation.
   *
   * **Why:** returning a structured result (instead of throwing) makes failures,
   * compensation, and traces first-class and easy to assert in tests.
   *
   * @param initialContext - seed context (e.g. `{ input }`); mutated during run.
   * @param options - `signal` (cancel), `maxSteps`, `hooks`, `onTrace`, `trace`.
   */
  run(
    initialContext: Partial<TContext>,
    options?: FlowRunOptions<TContext>,
  ): Promise<FlowRunResult<TOutput>>;
  /**
   * Return a copy of this flow with injected dependencies bound.
   *
   * **What:** the handlers/guards receive `deps` as their dependency argument on
   * every subsequent `run()`.
   *
   * **When to use:** in a `buildXFlow(deps)` factory, or per-request for
   * request-scoped deps.
   *
   * **Why:** validates every operation's `dependsOn(...)` against `deps` and
   * throws `MISSING_FLOW_DEPENDENCY` immediately, catching wiring errors at
   * construction rather than mid-run.
   */
  withDependencies(deps: TDeps): ExecutableFlow<TContext, TOutput, TDeps>;
  /**
   * Render a human-readable, indented map of the flow.
   *
   * **When to use:** to understand or document an operation at a glance, or in
   * CLI/devtools output.
   *
   * **Why:** the readable map is the primary product - one view of what runs,
   * what is checked, where it branches, and what happens on failure.
   */
  describe(): string;
  /**
   * Build a domain-neutral graph model (nodes + edges) of the flow.
   *
   * **When to use:** to feed custom visualizations, diff tooling, or analysis.
   *
   * **Why:** exposes the internal structure without leaking context/secrets.
   */
  toGraph(): FlowGraph;
  /**
   * Render the flow as a Mermaid `flowchart TD` string.
   *
   * **When to use:** to embed a diagram in docs/PRs or a devtools panel.
   *
   * **Why:** instant visualization derived from the same definition that runs.
   */
  toMermaid(): string;
  /**
   * Validate the flow's structure, returning errors and warnings.
   *
   * **When to use:** in unit tests and at app startup (often via
   * {@link FlowRegistry}) to fail fast on structural mistakes.
   *
   * **Why:** catches issues like missing `goTo` targets, empty sections, or
   * unbounded repeats before runtime. `{ strict: true }` promotes warnings
   * (e.g. write conflicts) to failures for CI.
   */
  validate(options?: { strict?: boolean }): FlowValidationResult;
  /**
   * Compute a stable hash of the flow's serializable structure.
   *
   * **When to use:** to record which exact flow shape ran (also placed on every
   * result/trace) so old logs can be matched after the code changes.
   *
   * **Why:** structure-only (ids, names, order, step kinds, metadata, version);
   * never includes function bodies, closures, deps, or runtime options.
   */
  definitionHash(): string;
}
