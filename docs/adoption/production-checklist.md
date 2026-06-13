# Production checklist

Before shipping a Pathline flow to production:

## Correctness

- [ ] `flow.validate({ strict: true }).ok === true` in CI.
- [ ] Register flows in a `FlowRegistry` and `validateAll({ strict: true })` at boot (Nest: `validateOnBootstrap`).
- [ ] Every `goTo` target exists and the flow is acyclic (loops use `repeat()`).
- [ ] Branches have an `otherwise()` or you intentionally rely on runtime `branch_unmatched`.

## Resilience

- [ ] External calls have `.timeoutMs()` and, where safe, `.retry()`.
- [ ] A `maxSteps` ceiling is set (default 10,000) appropriate to your loops.
- [ ] `onFailure` compensations release reservations/locks and are idempotent.
- [ ] `finally` cleans up resources regardless of success/failure.
- [ ] Side effects are idempotent; see [idempotency.md](idempotency.md).

## Cancellation

- [ ] Long flows accept an `AbortSignal` and pass `runtime.signal` to external calls.

## Observability

- [ ] `onTrace` and/or lifecycle hooks are wired to your logging/metrics.
- [ ] You store `runId`, `flowName`, `flowVersion`, and `definitionHash` with logs.
- [ ] `trace.repeatMode` / `trace.maxEvents` are tuned for search/import flows.

## Security

- [ ] No secrets/PII in traces; redaction is configured. See [security-redaction.md](security-redaction.md).
- [ ] Error detail is reduced in production (`NODE_ENV=production`).

## Durability

- [ ] You understand Pathline is in-process; durable execution is handled by your queue/job layer. See [durable-vs-in-process.md](durable-vs-in-process.md).
