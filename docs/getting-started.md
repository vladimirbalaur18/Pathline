# Getting started

## Install

```bash
pnpm add @pathline/core
# optional NestJS adapter
pnpm add @pathline/nestjs
```

## Your first flow

```ts
import { flow, operation } from '@pathline/core';

interface Ctx {
  input: { name: string };
  greeting?: string;
}

const greet = operation<Ctx>('Greet')
  .reads('input')
  .writes('greeting')
  .handler((ctx) => {
    ctx.greeting = `Hello, ${ctx.input.name}!`;
  });

const greetFlow = flow<Ctx, string>('Greet user')
  .stage('Greet')
  .do(greet)
  .output((ctx) => ctx.greeting!);

const result = await greetFlow.run({ input: { name: 'Ada' } });
console.log(result.ok, result.output); // true "Hello, Ada!"
```

## Binding dependencies

Operations receive `(ctx, deps, runtime)`. Bind services via `buildXFlow(deps)` and `withDependencies`:

```ts
export function buildGreetFlow(deps: Deps) {
  return flow<Ctx, string, Deps>('Greet user')
    .stage('Greet')
    .do(greet) // greet.dependsOn('translator')
    .output((ctx) => ctx.greeting!)
    .withDependencies(deps);
}
```

`withDependencies` validates every declared `dependsOn(...)` and throws `MISSING_FLOW_DEPENDENCY` immediately if something is missing.

`dependsOn(...)` also **narrows the handler's `deps` argument to the declared keys**, so using a dependency you did not declare is a compile-time error. In dev/test the runtime additionally warns about declared-but-unused dependencies. See [Concepts → Declaring dependencies](concepts.md#declaring-dependencies).

## Running

```ts
const result = await flow.run(initialContext, {
  signal: controller.signal, // optional AbortSignal
  maxSteps: 10_000,           // runaway-loop guard (default 10_000)
  onTrace: (event) => log(event),
  trace: { repeatMode: 'summary', maxEvents: 1000 },
});
```

`run()` never throws for business failures: inspect `result.ok`, `result.error`, `result.failureKind`, and `result.trace`.

## Next steps

- [Concepts](concepts.md) - stages, guards, branches, parallel, repeat, finally.
- [Testing](testing.md) - leaf and full-flow tests.
- [Tracing](tracing.md) - trace events and run results.
- [Debugging](adoption/debugging.md) - leaf breakpoints, flow traces, VS Code tips.
