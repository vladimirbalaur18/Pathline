# Tracing

Every run returns a `FlowRunResult` with a full `trace` and stable identifiers.

For a practical debugging workflow (leaf breakpoints vs flow traces, VS Code tips), see [adoption/debugging.md](adoption/debugging.md).

## FlowRunResult

```ts
{
  ok: boolean;
  output?: TOutput;
  error?: SerializedFlowError;
  failureKind?: FlowFailureKind;     // operation_failed | guard_denied | branch_unmatched
                                     // | timeout | cancelled | max_steps_exceeded
                                     // | compensation_failed | finally_failed | ...
  trace: FlowTraceEvent[];
  compensationErrors?: SerializedFlowError[]; // onFailure errors
  finallyErrors?: SerializedFlowError[];      // finally errors (kept separate)
  durationMs: number;
  flowName: string;
  flowVersion?: string;
  definitionHash: string;            // matches old traces to the exact flow shape
  runId: string;                     // stable per execution
}
```

## Trace events

Each `FlowTraceEvent` carries `kind` (`flow|stage|operation|guard|branch|parallel|repeat|subflow|compensation|finally|output`), `status` (`started|completed|failed|skipped|selected`), `runId`, optional `stageName`/`operationName`/`nodeId`, timing, and `error`.

Stream them live with `onTrace`:

```ts
await flow.run(ctx, { onTrace: (e) => otel.record(e) });
```

The event model is OpenTelemetry-compatible by design: flow/stage/operation map to spans; branch/compensation/repeat map to events. An OTel adapter can be built without runtime changes.

## Repeat trace volume

Large loops are summarized by default. With `trace.repeatMode: 'summary'` a `repeat` emits a single completed event with `attempts` and `childrenPolicy: 'summary'`. Use `repeatMode: 'full'` to keep per-iteration events, and `trace.maxEvents` to cap total events.

## What is NOT in the trace

The full context is **never** serialized into the trace by default. Operation inputs/outputs are not logged unless you opt in. See [adoption/security-redaction.md](adoption/security-redaction.md).
