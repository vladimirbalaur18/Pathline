# @pathline/core

The core of [Pathline](https://github.com/) - a TypeScript business-flow framework for modeling, executing, testing, tracing, and visualizing complex application operations.

Pathline is domain-agnostic and in-process (not a durable workflow engine).

## Install

```bash
pnpm add @pathline/core
```

## Quick start

```ts
import { flow, operation } from '@pathline/core';

const greetFlow = flow<{ name: string; greeting?: string }, string>('Greet')
  .stage('Greet')
  .do(operation('Greet').handler((ctx) => ({ greeting: `Hi ${ctx.name}` })))
  .output((ctx) => ctx.greeting!);

const result = await greetFlow.run({ name: 'Ada' });
// result.ok, result.output, result.trace, result.runId, result.definitionHash
```

## Features

- Fluent top-down authoring: `flow / stage / operation / guard / branch / parallel / repeat / subflow / onFailure / finally / output`.
- In-process runtime with `AbortSignal` cancellation, per-operation `timeoutMs`, `retry`, best-effort compensation, always-run `finally`, and a `maxSteps` safety ceiling.
- Structured results: `ok`, `output`, `error`, `failureKind`, `trace`, `compensationErrors`, `finallyErrors`, `runId`, `flowVersion`, `definitionHash`.
- `describe()`, `toGraph()`, `toMermaid()`, and `validate()` (with severities + strict mode).
- `FlowRegistry` for boot-time validation; dependency validation via `withDependencies`.
- Runner-agnostic trace helpers + optional Vitest matchers at `@pathline/core/testing`.

See the [documentation](../../docs/getting-started.md).

## License

MIT
