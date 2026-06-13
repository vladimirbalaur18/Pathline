# Migrating an existing service

A pragmatic path to introduce Pathline into an existing controller/service without a big-bang rewrite.

## 1. Pick one complex operation

Choose an endpoint or job with several steps, gates, and error handling - the kind of code that is hard to read top-to-bottom today.

## 2. Define the context type

Model the data that flows through the operation:

```ts
interface Ctx {
  input: { /* request shape */ };
  // intermediate values populated by operations
  response?: ResponseShape;
}
```

## 3. Extract leaf operations

Move each discrete step into an `operation(...)`. Keep the existing service calls; just wrap them. Declare `dependsOn`, `reads`, `writes` for clarity and validation.

```ts
const loadOrder = operation<Ctx, Deps>('Load order')
  .dependsOn('orderService')
  .writes('order')
  .handler(async (ctx, deps) => ({ order: await deps.orderService.find(ctx.input.id) }));
```

## 4. Assemble the flow

Translate the procedure into stages, guards, branches, parallel sections, and an `onFailure` compensation block. Add `.finally()` for cleanup (locks, temp files).

## 5. Bind dependencies via a factory

```ts
export function buildCheckoutFlow(deps: Deps) {
  return flow<Ctx, Out, Deps>('Checkout')/* ... */.output(c => c.response!).withDependencies(deps);
}
```

In Nest, provide it with a `useFactory` that injects your existing services.

## 6. Wire the controller to FlowRunner

The controller becomes thin: build context from the request, run, map the result.

## 7. Add tests and validate

Write full-flow tests with mock deps and `flow.validate({ strict: true })` in CI. Keep your existing integration tests as a safety net during migration.

## 8. Iterate

Migrate one operation at a time. Each flow is independent, so adoption can be incremental.
