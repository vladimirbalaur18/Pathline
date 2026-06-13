# Concepts

Pathline separates a complex operation into two levels: the **flow root** (the top-down business map) and **leaf operations** (isolated, testable units).

## Flow

`flow<TContext, TOutput, TDeps>(name)` creates a builder. Finalize with `.output(resolver)` (or `.build()` for no output) to get an `ExecutableFlow`.

Flow-level metadata: `.version('1.0.0')`, `.metadata({...})`, `.tags(...)`, `.redact(ctx => ...)`.

## Stage

`.stage(name, { id? })` opens a readable group. Only one stage is "current" at a time; opening a new stage closes the previous one. Stage steps run in declaration order.

## Operation

`operation<TContext, TDeps>(name, { id? })` with optional `.reads()`, `.writes()`, `.dependsOn()`, `.timeoutMs()`, `.retry()`, `.redactTrace()`, `.metadata()`, `.tags()`, then `.handler(fn)`.

A handler may **mutate `ctx`** or **return a `Partial<TContext>` patch** (shallow-merged after success; the patch wins on top-level key conflicts).

Test in isolation with `operation.run(ctx, deps)`.

### Declaring dependencies

Pass a concrete `TDeps` interface to `operation<Ctx, Deps>(...)` so `.dependsOn('...')`
offers IDE autocomplete for each service key (same for `.reads()` / `.writes()` on
`TContext` keys).

`.dependsOn('serviceA', 'serviceB')` does three things:

1. **Compile-time scoping.** Once you call `dependsOn`, the handler's `deps`
   argument is narrowed to exactly the declared keys, so reading an *undeclared*
   dependency is a TypeScript error (and declaring a key that is not on `TDeps`
   is also a type error). If you never call `dependsOn`, the handler sees the
   full `TDeps` - deps-free operations are unaffected.
2. **Bind-time validation.** `withDependencies(deps)` throws
   `MISSING_FLOW_DEPENDENCY` if a declared dependency is absent.
3. **Dev/test warning.** During a run (when `NODE_ENV !== 'production'`), the
   runtime warns via the logger if a declared dependency is never actually read
   by the handler (`UNUSED_FLOW_DEPENDENCY`) or a dependency is read without
   being declared (`UNDECLARED_FLOW_DEPENDENCY`).

The same `dependsOn()` narrowing and warnings apply to **guards** that inject
services into `check()` / `denyWith()`.

```ts
operation<Ctx, Deps>('Load subscription')
  .dependsOn('billingService')
  .handler(async (ctx, deps) => {
    // deps.billingService is allowed; deps.authService would be a TYPE ERROR
    ctx.subscription = await deps.billingService.find(ctx.workspace.id);
  });
```

### Declaring context reads and writes

`.reads('fieldA')` and `.writes('fieldB')` document which context keys an
operation touches. They also power `validate()` (e.g. `PARALLEL_WRITE_CONFLICT`).

| Check | `dependsOn` | `reads` | `writes` |
| --- | --- | --- | --- |
| Invalid declared key | compile-time | compile-time | compile-time |
| Undeclared usage | compile-time (`deps`) | dev/test runtime (`ctx` gets) | compile-time (returned patch); dev/test runtime (`ctx` sets) |
| Declared but unused | dev/test runtime | dev/test runtime | dev/test runtime |

**Why reads are not compile-time narrowed on `ctx`:** handlers almost always
mutate `ctx` directly (`ctx.user = …`). Narrowing `ctx` to `Pick<Ctx, Reads>`
would block legitimate writes. Returned patches *are* narrowed when you call
`writes()`, because those are explicit.

Runtime warning codes: `UNUSED_CONTEXT_READ`, `UNDECLARED_CONTEXT_READ`,
`UNUSED_CONTEXT_WRITE`, `UNDECLARED_CONTEXT_WRITE`.

### Other primitives (audit)

| Primitive | Typed declarations today | Notes |
| --- | --- | --- |
| `operation` | `reads`, `writes`, `dependsOn` | primary enforcement surface |
| `guard` | `dependsOn` | context reads are usually fine without extra metadata |
| `flow.output()` | none | could declare output reads post-v1 |
| `branch.when(predicate)` | none | predicates are arbitrary; hard to enforce statically |
| `parallel()` | via op `writes()` | `validate()` checks write conflicts |
| `repeat.stopWhen` | none | same as branch predicates |
| `subflow` | inherits child ops | validated recursively |

## Guard

`guard<TContext, TDeps>(name).check(fn).denyWith(fn)`. When `check` returns false, `denyWith` runs (and should throw a `FlowHttpError`/`FlowError`); without a custom deny handler a default `GUARD_DENIED` error is thrown.

## Branch

`.branch(name, b => ...)` evaluates `when(name, predicate)` cases in order; the first match wins, else `otherwise()`. Each case takes one action:

- `.goTo(stageName)` - jump to another stage
- `.do(operation)` - run an inline operation and continue
- `.continueRepeat()` / `.stopRepeat()` - control the enclosing `repeat()`
- `.fail(error)` - fail the flow

If no case matches and there is no `otherwise()`, the runtime fails with `branch_unmatched`.

## Parallel

`.parallel(name, p => p.do(a).do(b))` runs operations concurrently.

- `.mode('failFast')` (default) rejects on the first failure.
- `.mode('collectAll')` runs all and aggregates errors.
- `.concurrency(n)` bounds simultaneity.

`validate()` flags `PARALLEL_WRITE_CONFLICT` when two operations declare the same `writes()` path.

## Repeat

`.repeat(name, r => ...)` is the loop primitive (use this instead of `goTo` loops):

```ts
.repeat('Generate candidates', (r) =>
  r
    .maxAttempts(500)
    .timeBudgetMs(3000)
    .stopWhen('perfect', (ctx) => ctx.bestScore === 0)
    .do(buildCandidate)
    .branch('Result', (b) =>
      b.when('invalid', (ctx) => !ctx.candidate.valid).continueRepeat()
       .otherwise().do(scoreAndKeep)),
)
```

## goTo and loop safety

`goTo` is for **acyclic** stage jumps. Loops use `repeat()`. A global `maxSteps` (default 10,000) bounds total executed steps and fails with `max_steps_exceeded` to catch runaway logic.

## Subflow

`.subflow(otherFlow, { mapOutput })` runs another `ExecutableFlow` with the same context/deps; its trace nests under the parent and its failure fails the parent step.

## onFailure (compensation)

`.onFailure().do(...)` runs only when the main flow fails. Compensations are best-effort: their errors are collected into `compensationErrors` and never hide the primary error.

## finally (cleanup)

`.finally().do(...)` runs after success or failure (locks, temp files, sessions). Errors go to `finallyErrors`. If the main flow succeeds but `finally` fails, the result is `ok: false`, `failureKind: 'finally_failed'`, with the already-resolved `output` preserved.

## Output

`.output(ctx => ...)` runs only after a successful main flow and may be sync or async.
