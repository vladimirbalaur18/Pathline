# Security & redaction

Pathline frequently sits around auth, billing, user data, and external providers. It is built to avoid leaking sensitive data by default.

## Defaults

- The **full context is never serialized into the trace**. Trace events store names, ids, status, timing, and errors - not raw context values.
- Operation inputs/outputs are **not logged** unless you opt in via `onTrace`/hooks.
- Stack traces are included in serialized errors only when `NODE_ENV !== 'production'`.
- `describe()`, `toGraph()`, and `toMermaid()` render structure (names/ids), never context values - so no secrets appear in diagrams.

## Redaction API

Provide sanitized snapshots when you do want to capture context for debugging:

```ts
flow('Run paid agent').redact((ctx) => ({
  input: { authorization: '[REDACTED]' },
}));

operation('Authenticate user').redactTrace((ctx) => ({ token: '[REDACTED]' }));
```

Use these to define exactly what a debug snapshot may contain. Never place tokens, payment identifiers, PII, or raw request bodies in trace output.

## Error output policy

- Throw `FlowHttpError` with safe, user-facing `message` and `code`. Put sensitive context in `details` only when appropriate for your audience.
- In production, prefer returning `code` + generic `message` to clients; log richer detail server-side keyed by `runId`.

## Checklist

- [ ] Redaction configured for any flow handling secrets/PII.
- [ ] `onTrace` sink does not persist raw context.
- [ ] `NODE_ENV=production` in production (drops stack traces from serialized errors).
- [ ] Diagrams/describe output reviewed - they contain names only.
