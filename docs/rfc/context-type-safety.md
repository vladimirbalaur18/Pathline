# RFC: Context type safety across stages

**Status:** Draft  
**Author:** Pathline maintainers  
**Created:** 2026-06-14  
**Tracking:** Architectural review follow-up (P0)

## Summary

Pathline v1 gives strong compile-time safety for **dependencies** (`.dependsOn()`) and **returned write patches** (`.writes()`), but **context reads** across sequential stages remain loosely typed. As flows grow, `TContext` becomes a wide interface of optional fields and teams rely on `?.` checks and implicit ordering.

This RFC explores how to express **required context keys** at compile time without blocking the dominant pattern of in-place `ctx` mutation.

## Problem

Consider a three-step linear flow:

```ts
flow<Ctx, Response>('Run agent')
  .stage('Access').do(loadWorkspace)      // provides ctx.workspace
  .stage('Billing').do(loadSubscription)   // requires ctx.workspace
  .stage('Run').do(runAgent)              // requires ctx.subscription
  .output((c) => c.response!);
```

Today, `loadSubscription`'s handler sees full `Ctx`. TypeScript does not error if `loadSubscription` is moved **before** `loadWorkspace`, even when it reads `ctx.workspace`. Developers discover ordering bugs at runtime or in integration tests.

### What works today

| Mechanism | Enforcement | Scope |
| --- | --- | --- |
| `.dependsOn()` | Compile-time | `deps` narrowing |
| `.writes()` on return patch | Compile-time | returned `Partial<Ctx>` |
| `.reads()` / `.writes()` | Dev/test runtime + `validate()` | documentation, parallel conflicts |
| Focused `TContext` per flow | Convention | optional fields as lifecycle markers |
| Subflows | Convention | narrower context per child flow |

### Why reads are not narrowed on `ctx` (v1)

Handlers almost always mutate `ctx` directly (`ctx.user = …`). Narrowing `ctx` to `Pick<Ctx, Reads>` would block legitimate writes in the same handler. Returned patches are narrowed because they are explicit.

See [Concepts → Declaring context reads and writes](../concepts.md#declaring-context-reads-and-writes).

## Goals

1. **Linear flows:** after op A provides key K, op B that requires K should type-check when declared after A.
2. **Preserve in-place mutation** as the primary authoring style.
3. **Incremental adoption** — existing flows compile without changes.
4. **Feed `validate()`** — static declarations should strengthen structural checks.

## Non-goals

- Full path-sensitive typing across all branches and `goTo` jumps (TypeScript cannot do this reliably at scale).
- Replacing `TContext` with a dynamic map or runtime schema.
- Breaking the fluent DSL or moving control flow back to raw `if/switch`.

## Interim patterns (v1.x, no API changes)

Until a typing story ships, teams can:

1. **Keep context interfaces focused per flow** — only fields this flow touches; use optional fields as lifecycle markers (`workspace?` → required after Load workspace stage).

   Example: `examples/scheduling/src/scheduling.types.ts`

2. **Declare `.reads()` / `.writes()` on every operation** — enables `validate({ strict: true })` and parallel write conflict detection in CI.

3. **Split mega-flows into subflows** — each subflow gets a narrower `TContext`; parent maps output via `mapOutput`.

4. **Test ordering explicitly** — trace helpers assert that step N never runs before prerequisites fail.

5. **v1.x enhancement (runtime):** extend `validate()` with a `MISSING_CONTEXT_READ` check for linear stage order (best-effort, no branch awareness). Optional follow-up, not blocking v2.

## Proposed approaches

### Option A: `requires()` / `provides()` on operations (recommended)

Mirror `.dependsOn()` / `.writes()` but for **context availability**:

```ts
const loadSubscription = operation<Ctx, Deps>('Load subscription')
  .requires('workspace')
  .provides('subscription')
  .dependsOn('billingService')
  .handler(async (ctx, deps) => {
    ctx.subscription = await deps.billingService.find(ctx.workspace.id);
  });
```

`FlowBuilder` accumulates phantom type parameter `TAvailable extends keyof TContext`:

```ts
flow<Ctx, Response, Deps, /* TAvailable */ 'input'>('Run agent')
  .stage('Access').do(loadWorkspace)    // TAvailable → 'input' | 'workspace'
  .stage('Billing').do(loadSubscription) // requires workspace ⊆ TAvailable ✓
  ...
```

**Pros**

- Familiar API parallel to `dependsOn` / `reads` / `writes`
- Compile-time errors on `.do()` when prerequisites missing
- Can narrow handler `ctx` to `RequireKeys<Ctx, TRequires>` for declared requires
- Declarations feed `describe()` and `validate()`

**Cons**

- Branch/`goTo` paths diverge — only the **linear declaration order** is checked; runtime `validate()` still needed for branch-heavy flows
- `FlowBuilder` generic arity grows (manageable with defaults)
- Parallel sections need all ops' requires ⊆ available; provides merged as union

**Branch handling (pragmatic):** type-check each `.do()` against keys available on **all paths that reach that point** is undecidable in TS. Instead:

- Linear segments: full compile-time checks
- After `.branch()` / `.goTo()`: reset or widen `TAvailable` to a declared baseline, rely on `validate()` + tests

### Option B: Stage-scoped context types

Model context as a sequence of interfaces:

```ts
type Ctx0 = { input: Input };
type Ctx1 = Ctx0 & { workspace: Workspace };
type Ctx2 = Ctx1 & { subscription: Subscription };
```

Each operation is typed against a specific stage context; the flow builder threads `Ctx0 → Ctx1 → Ctx2`.

**Pros**

- Strongest possible linear typing
- No optional-field ambiguity

**Cons**

- Heavy boilerplate; awkward with shared operation libraries
- Poor fit for branches that skip stages
- Breaks today's single `TContext` parameter on `flow<Ctx, ...>`

**Verdict:** good for generated code or very large generated pipelines; poor default DX.

### Option C: Return-patch-only context (no in-place mutation)

Require handlers to `return { workspace }` instead of `ctx.workspace = …`; narrow `ctx` through patch chaining.

**Pros**

- Easier to track provides at type level (already partially done via `.writes()`)

**Cons**

- Fights established Pathline style and examples
- Parallel merge semantics harder with patches only
- Large migration cost

**Verdict:** reject as the primary model; keep patches as an optional style.

## Recommendation

**Ship Option A in v2** as an opt-in enhancement:

1. Add `.requires(...)` and `.provides(...)` to `operation()` (and optionally `guard().requires(...)`).
2. Extend `FlowBuilder` with phantom `TAvailable` (defaults to `never` or `keyof Ctx` for back-compat).
3. `.do(op)` type-errors when `op.requires ⊄ TAvailable`.
4. After `.do(op)`, `TAvailable |= op.provides`.
5. Narrow handler `ctx` to `RequireKeys<Ctx, TRequires>` when `.requires()` was called (same pattern as `dependsOn`).
6. Extend `validate()` for branch-aware best-effort checks.
7. Document branch/`goTo` limitations explicitly.

**v1.x:** document interim patterns (this RFC + concepts link); optional `validate()` enhancement for linear flows.

## Migration path

| Phase | Change | Breaking? |
| --- | --- | --- |
| v1.x docs | Interim patterns, link RFC | No |
| v1.x optional | `validate()` linear read-order warnings | No |
| v2 opt-in | `.requires()` / `.provides()`; flows without them unchanged | No |
| v2 strict mode | `flow<Ctx, Out, Deps, TAvailable>` with inference from first op | No |
| v3? | `strictContext: true` in `validate()` treats missing declarations as errors | Opt-in |

Existing flows: no changes required. Teams adopt `.requires()` / `.provides()` operation-by-operation.

## Open questions

1. Should `requires()` imply `.reads()` for metadata/warnings, or stay separate?
2. How should `subflow` declare context import/export (`requires`/`provides` on the subflow boundary)?
3. Should `output()` declare required keys (compile-time check on resolver `ctx`)?
4. Guards: `requires()` only, or also `provides()` (unlikely)?
5. IDE UX: show "available context keys" on hover at each `.do()`?

## Prototype

Type-level proof for linear `requires` / `provides` accumulation:

`packages/core/src/__tests__/context-requires-prototype.test-d.ts`

Run: `pnpm --filter @pathline/core typecheck` (includes `*.test-d.ts`).

## References

- [Concepts → Declaring context reads and writes](../concepts.md#declaring-context-reads-and-writes)
- `packages/core/src/__tests__/reads-writes-intellisense.test-d.ts`
- `packages/core/src/operation/operation.ts` — `HandlerDeps` / `HandlerPatch` pattern to mirror
- `examples/scheduling/src/scheduling.types.ts`
