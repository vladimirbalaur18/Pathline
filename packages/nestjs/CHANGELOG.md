# @pathline/nestjs

## 0.2.0

### Minor Changes

- 37d6518: Initial release of Pathline: a domain-agnostic TypeScript business-flow framework.

  - `@pathline/core`: fluent authoring API (flow/stage/operation/guard/branch/parallel/repeat/subflow/onFailure/finally/output), an in-process runtime with cancellation, per-operation timeout, retry, best-effort compensation and always-run finally, full tracing with `runId`/`flowVersion`/`definitionHash`, `describe()`/`toGraph()`/`toMermaid()`, `validate()` with severities, `FlowRegistry`, and runner-agnostic trace helpers.
  - `@pathline/nestjs`: thin adapter with `PathlineModule.forRoot()`, `FlowRunner`, `RequestScopedFlowRunner`, `FlowHttpExceptionFilter`, and `FlowTraceInterceptor`.

### Patch Changes

- Updated dependencies [37d6518]
  - @pathline/core@0.2.0
