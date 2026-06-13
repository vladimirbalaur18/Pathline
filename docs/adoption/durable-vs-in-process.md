# Durable vs in-process

Pathline v1 is an **in-process flow orchestrator, not a durable workflow engine**.

- A flow runs within a single process/request. There is no persistence of intermediate state.
- If the process crashes mid-flow, Pathline does **not** resume automatically.
- There is no built-in retry-across-restarts, no event sourcing, no distributed coordination.

This is intentional. Pathline optimizes for readability, testability, and debuggability of business logic, not for durable execution.

## When you need durability

Pair Pathline with infrastructure that owns durability:

- Run a Pathline flow **inside** a queue/job worker (BullMQ, SQS consumer, cron). The queue provides at-least-once delivery and retries; the flow provides the readable business logic.
- Make externally-visible side effects **idempotent** (see [idempotency.md](idempotency.md)) so re-running a job is safe.
- Use a [transactional outbox](transactional-outbox.md) for events/webhooks emitted by a flow.

## Not a replacement for

Temporal, Inngest, AWS Step Functions, or BullMQ. Those provide durable execution; Pathline provides in-process orchestration with first-class tracing and testing. They compose well together.
