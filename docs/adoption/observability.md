# Observability

## onTrace

Stream every trace event live:

```ts
await flow.run(ctx, { onTrace: (event) => sink.record(event) });
```

In Nest, set `onTrace` once in `PathlineModule.forRoot({ tracing: true, onTrace })`.

## Lifecycle hooks

```ts
await flow.run(ctx, {
  hooks: {
    beforeFlow, afterFlow,
    onFlowStart, onFlowComplete, onFlowFail,
    beforeOperation, afterOperation,
    onOperationStart, onOperationComplete, onOperationFail,
  },
});
```

Operation hooks receive an `OperationLifecycleEvent` with `flowName`, `runId`, `stageName`, `operationName`, `nodeId`, `status`, `attempt`, and `ctx`. Use them for audit, metrics, request correlation, tenant scoping, and security checks.

## Correlation

Every event and the result carry a `runId`. Log it alongside your request id. Persist `flowName`, `flowVersion`, and `definitionHash` so a trace can later be matched to the exact flow structure that ran.

## OpenTelemetry

The event/span model is OTel-compatible by design: flow -> root span, stage -> child span, operation -> span; branch/compensation/repeat -> events. You can build an OTel adapter that subscribes to `onTrace`/hooks without changing the runtime.

## Logger adapter

Provide a `Logger` (`debug/info/warn/error`) via run options or the Nest module to route framework-level messages into your logging stack.
