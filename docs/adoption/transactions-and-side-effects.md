# Transactions and side effects

Pathline does not manage database transactions or distributed consistency. Your application owns those concerns; Pathline gives you a clear place to structure them.

## Single-database transactions

Open the transaction in an early operation, carry the transaction handle in context, and commit/rollback explicitly:

```ts
const begin = operation<Ctx, Deps>('Begin tx')
  .dependsOn('db')
  .handler(async (ctx, deps) => ({ tx: await deps.db.begin() }));

const commit = operation<Ctx, Deps>('Commit tx')
  .handler(async (ctx) => { await ctx.tx.commit(); });

const rollback = operation<Ctx, Deps>('Rollback tx')
  .handler(async (ctx) => { await ctx.tx?.rollback(); });
```

Put `commit` at the end of the happy path and `rollback` in `.finally()` (so it runs on both success-after-commit no-op and failure). Make rollback safe to call after commit (no-op if already committed).

## External side effects

External effects (charges, emails, webhooks) cannot be rolled back by a DB transaction. Two strategies:

- **Compensation**: perform the effect, and add a compensating action in `.onFailure()` (e.g. `authorizeOverage` -> `voidOverage`). This is the saga pattern Pathline supports directly.
- **Defer via outbox**: write an intent inside the DB transaction and dispatch the effect afterward. See [transactional-outbox.md](transactional-outbox.md).

## Ordering

Do irreversible external effects as late as possible (after gates and reservations pass), and make them [idempotent](idempotency.md) so retries are safe.
