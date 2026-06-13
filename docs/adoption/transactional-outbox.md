# Transactional outbox

When a flow must both update the database and emit events/webhooks, do not emit directly inside the flow - a crash between the DB commit and the emit causes inconsistency (Pathline is [in-process](durable-vs-in-process.md) and will not resume). Use the transactional outbox pattern.

## Pattern

1. Inside the same DB transaction that persists your state, insert an **outbox row** describing the event.
2. Commit the transaction. State and the pending event are now atomic.
3. A separate dispatcher (poller or CDC) reads unsent outbox rows and publishes them, marking them sent.

## In a flow

```ts
const saveResultAndOutbox = operation<Ctx, Deps>('Save result + outbox')
  .dependsOn('db')
  .handler(async (ctx, deps) => {
    await deps.db.transaction(async (tx) => {
      await tx.agentRuns.insert(ctx.agentRun);
      await tx.outbox.insert({ type: 'agent.run.completed', payload: { id: ctx.agentRun.id } });
    });
  });
```

The flow stays readable; the dispatcher (outside Pathline) guarantees the event is delivered at least once. Keep consumers idempotent - see [idempotency.md](idempotency.md).

## Why not emit in `.finally()`?

`finally` improves cleanup, but it still runs in-process and offers no cross-restart guarantee. For events that must not be lost, the outbox (backed by your database) is the durable boundary.
