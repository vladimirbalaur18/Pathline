/**
 * @pathline/core - a TypeScript business-flow framework for modeling,
 * executing, testing, tracing, and visualizing complex application operations.
 *
 * Pathline v1 is an in-process orchestrator, not a durable workflow engine.
 */

// Authoring API
export { flow, FlowBuilder } from './flow/flow.js';
export { operation } from './operation/operation.js';
export type { OperationBuilder } from './operation/operation.js';
export { guard } from './guard/guard.js';
export type { GuardBuilder } from './guard/guard.js';
export { BranchBuilder } from './branch/branch.js';
export { ParallelBuilder } from './parallel/parallel.js';
export { RepeatBuilder } from './repeat/repeat.js';

// Runtime
export { runFlow } from './runtime/runner.js';
export type { RunMeta } from './runtime/runner.js';
export { createExecutableFlow } from './flow/executable.js';

// Registry + validation
export { FlowRegistry } from './registry/registry.js';
export type { RegistryValidationResult } from './registry/registry.js';
export { validateFlow } from './validate/validate.js';
export type { ValidateOptions } from './validate/validate.js';

// Graph / describe
export { buildGraph } from './graph/graph-builder.js';
export { renderMermaid } from './graph/mermaid-renderer.js';
export { describeFlow } from './graph/describe-renderer.js';

// Errors
export {
  FlowError,
  FlowHttpError,
  FlowValidationError,
  FlowTimeoutError,
  FlowCancelledError,
  serializeError,
} from './errors/index.js';
export type { FlowErrorOptions, FlowHttpErrorOptions } from './errors/index.js';

// Types
export type {
  FlowStatus,
  OperationStatus,
  FlowFailureKind,
  SerializedFlowError,
  TraceKind,
  TraceStatus,
  FlowTraceEvent,
  FlowRunResult,
  RuntimeApi,
  BackoffStrategy,
  RetryPolicy,
  OperationHandler,
  NamedOptions,
  OperationDefinition,
  GuardDefinition,
  FlowErrorInput,
  BranchAction,
  BranchCase,
  BranchDefinition,
  ParallelMode,
  ParallelDefinition,
  RepeatStopCondition,
  RepeatDefinition,
  SubflowDefinition,
  Step,
  StageDefinition,
  FlowDefinition,
  OperationLifecycleEvent,
  FlowRuntimeHooks,
  Logger,
  TraceOptions,
  FlowRunOptions,
  FlowValidationIssue,
  FlowValidationResult,
  FlowGraphNodeKind,
  FlowGraphNode,
  FlowGraphEdge,
  FlowGraph,
  ExecutableFlow,
  DepKey,
  ContextKey,
} from './types.js';
