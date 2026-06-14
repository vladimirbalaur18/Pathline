# Debugging

Pathline optimizes for **business-step debugging** — traces, structured failures, and isolated leaf tests — rather than stepping through the fluent DSL line by line.

## Two levels

| Level | When to use | How |
| --- | --- | --- |
| **Leaf** | A single step misbehaves | Breakpoint in the operation handler; `operation.run(ctx, deps)` |
| **Flow** | Wrong path, branch, or compensation | `result.trace`, `onTrace`, `runId`, trace test helpers |

## Debug at the leaf

Operations are plain async functions. Set a breakpoint inside `.handler(...)` and run the operation directly — no flow, no Nest boot:

```ts
const ctx = { input: { workspaceId: 'workspace-1' } } as Ctx;
const deps = { workspaceService: mockWorkspaceService };

await loadWorkspace.run(ctx, deps); // breakpoint here steps into your handler
```

This is the most reliable place for **step-through debugging** in VS Code or Cursor. The handler body is normal TypeScript; the framework is not in the call stack.

## Debug at the flow

`flow.run()` returns a structured result instead of throwing for business failures:

```ts
const result = await runPaidAgentFlow.run(ctx);

result.ok;             // false
result.failureKind;    // 'guard_denied' | 'operation_failed' | 'branch_unmatched' | ...
result.error;          // { code, message, statusCode, ... }
result.runId;          // correlate logs for this execution
result.definitionHash; // match trace to the exact flow shape that ran
result.trace;          // ordered timeline of stages, guards, branches, compensations
```

The trace answers: which stage ran, which branch was selected, where it stopped, and which compensations executed. See [Tracing](../tracing.md).

Stream events live during development:

```ts
await flow.run(ctx, {
  onTrace: (event) => console.log(event.kind, event.status, event.operationName),
});
```

In NestJS, enable `tracing: true` and wire `onTrace` in `PathlineModule.forRoot(...)` to route events into your logger.

## VS Code / Cursor tips

**Breakpoints on `.do()` or `.branch()` step into the framework executor** (`runner.ts`), not the next business logic line. That is expected — the DSL is declarative; execution goes through an internal graph runner.

Instead:

1. Break in **operation handler files** (or call `operation.run()` from a test).
2. Use **conditional breakpoints** on `result.failureKind` or a specific `operationName` in `onTrace`.
3. Assert business paths in tests with `@pathline/core/testing` helpers (`hasRun`, `hasFailedAt`, `hasSelectedBranch`, …). See [Testing](../testing.md).

## NestJS

- `FlowTraceInterceptor` logs trace summaries per request when `tracing: true`.
- `FlowHttpExceptionFilter` maps `FlowHttpError` to HTTP responses with stable error codes.
- Pass `onTrace` in `PathlineModule.forRoot` to mirror flow events into your logging stack during local development.

## What Pathline does not provide (v1)

- No runner "debug mode" that skips framework frames when stepping through `.do()` / `.branch()`.
- No automatic serialization of full `ctx` into traces (see [security & redaction](security-redaction.md)).

For post-mortems in production, rely on `runId`, `failureKind`, and `trace` — not raw stack traces alone.
