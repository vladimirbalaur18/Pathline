# Testing

Pathline supports testing at two levels.

## 1. Leaf operation tests

```ts
import { vi } from 'vitest';
import { loadWorkspace } from './load-workspace.operation';

it('loads workspace by id', async () => {
  const ctx = { input: { workspaceId: 'workspace-1' } } as Ctx;
  const deps = {
    workspaceService: { findById: vi.fn().mockResolvedValue({ id: 'workspace-1' }) },
  };
  await loadWorkspace.run(ctx, deps);
  expect(ctx.workspace).toEqual({ id: 'workspace-1' });
});
```

`operation.run(ctx, deps)` applies any returned patch, so it works for both mutation- and patch-style handlers.

## 2. Full flow tests (no Nest)

```ts
const result = await buildRunPaidAgentFlow(createMockDeps({ plan: basicPlan })).run({
  input: { workspaceId: 'workspace-1', authorization: 'Bearer valid', body },
});

expect(result.ok).toBe(false);
expect(result.error?.code).toBe('FEATURE_NOT_INCLUDED');
```

## Trace helpers

Runner-agnostic helpers from `@pathline/core/testing` work with Jest or Vitest:

```ts
import {
  hasRun, hasCompleted, hasFailedAt, hasSelectedBranch, hasRunCompensation,
} from '@pathline/core/testing';

expect(hasRun(result.trace, 'Run agent')).toBe(false);
expect(hasFailedAt(result.trace, 'Plan includes AI agent runs')).toBe(true);
expect(hasSelectedBranch(result.trace, 'Usage quota', 'Overage allowed')).toBe(true);
expect(hasRunCompensation(result.trace, 'Release reserved usage')).toBe(true);
```

## Optional Vitest matchers

```ts
import { expect } from 'vitest';
import { pathlineMatchers } from '@pathline/core/testing';

expect.extend(pathlineMatchers);
expect(result.trace).toHaveRun('Run agent');
expect(result.trace).toHaveFailedAt('Plan includes AI agent runs');
```

## Validate in CI

```ts
expect(flow.validate({ strict: true }).ok).toBe(true);
```
