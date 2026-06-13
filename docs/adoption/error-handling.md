# Error handling

## Error types

- `FlowError` - base business error (`code`, `details`).
- `FlowHttpError extends FlowError` - adds `statusCode` for HTTP apps.
- `FlowValidationError` - thrown by strict validation / registry.
- `FlowTimeoutError` - a per-operation timeout elapsed.
- `FlowCancelledError` - the run was aborted via `AbortSignal`.

Throw `FlowHttpError` from operations/guards to express domain failures:

```ts
throw new FlowHttpError({ statusCode: 402, code: 'QUOTA_EXCEEDED', message: 'Over quota' });
```

## run() does not throw for business failures

`flow.run()` returns a `FlowRunResult`. Inspect it instead of try/catch:

```ts
const result = await flow.run(ctx);
if (!result.ok) {
  // result.error: SerializedFlowError
  // result.failureKind: why it failed
  // result.trace: the full timeline
}
```

## failureKind

`operation_failed | guard_denied | branch_unmatched | validation_failed | timeout | cancelled | max_steps_exceeded | compensation_failed | finally_failed | internal_error`.

Use it to map failures to HTTP statuses or metrics without string-matching messages.

## Compensation vs finally errors

- `compensationErrors` - thrown by `onFailure` steps (failure recovery). Best-effort; never hide the primary error.
- `finallyErrors` - thrown by `finally` steps (always-run cleanup). Kept separate. If the main flow succeeded but a `finally` step fails, `ok` becomes `false` with `failureKind: 'finally_failed'` and the resolved `output` is preserved.

## Mapping to HTTP (NestJS)

Use `FlowHttpExceptionFilter`, or in a controller convert `result.error` (when it has `statusCode`) into a thrown `FlowHttpError` so the filter maps it to `{ statusCode, code, message, details }`.
