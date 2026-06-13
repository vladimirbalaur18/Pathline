# Idempotency

Because Pathline is [in-process](durable-vs-in-process.md), durability comes from the surrounding queue/job layer, which typically delivers **at least once**. That means a flow may run more than once for the same logical request. Design externally-visible side effects to be idempotent.

## Idempotency keys

Derive a stable key from the request and pass it through context:

```ts
const ctx = { input: { ...req, idempotencyKey: `agent-run:${workspaceId}:${requestId}` } };
```

Pass the key to providers that support it (payment processors, email APIs) so duplicates are deduplicated server-side.

## Guard with a dedupe store

Add an early operation/guard that records the key and short-circuits duplicates:

```ts
const ensureFirstRun = guard<Ctx, Deps>('First run for key')
  .check(async (ctx, deps) => deps.idempotencyStore.claim(ctx.input.idempotencyKey))
  .denyWith(() => { throw new FlowHttpError({ statusCode: 409, code: 'DUPLICATE', message: 'Already processed' }); });
```

## Reservations and compensation

Use reserve -> commit with `onFailure` release. A re-run should observe the prior reservation/commit and avoid double-charging. Combine with an idempotency key so commit is safe to repeat.

## Make commits safe to repeat

Commit/finalize operations should be no-ops when the work is already finalized (check state first). This keeps retries and re-deliveries safe.
