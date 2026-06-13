import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';
import { hasRun, hasSelectedBranch } from '../testing/helpers.js';

interface Ctx {
  usage: { used: number; limit: number };
  allowsOverage: boolean;
  path?: string;
}

const mark = (label: string) =>
  operation<Ctx>(`Mark ${label}`).handler(() => ({ path: label }));

function build() {
  return flow<Ctx, string>('Quota')
    .stage('Gate')
    .branch('Usage quota', (b) =>
      b
        .when('Within quota', (ctx) => ctx.usage.used < ctx.usage.limit)
        .goTo('Within')
        .when('Overage allowed', (ctx) => ctx.allowsOverage)
        .goTo('Overage')
        .otherwise()
        .goTo('Reject'),
    )
    .stage('Within')
    .do(mark('within'))
    .goTo('Done')
    .stage('Overage')
    .do(mark('overage'))
    .goTo('Done')
    .stage('Reject')
    .fail({ statusCode: 402, code: 'QUOTA_EXCEEDED', message: 'Over quota' })
    .stage('Done')
    .do(mark('done'))
    .output((ctx) => ctx.path!);
}

describe('branch flow execution', () => {
  it('selects the first matching case', async () => {
    const result = await build().run({
      usage: { used: 1, limit: 10 },
      allowsOverage: false,
    });
    expect(result.ok).toBe(true);
    expect(hasSelectedBranch(result.trace, 'Usage quota', 'Within quota')).toBe(true);
    expect(hasRun(result.trace, 'Mark within')).toBe(true);
  });

  it('falls to the second case', async () => {
    const result = await build().run({
      usage: { used: 20, limit: 10 },
      allowsOverage: true,
    });
    expect(hasSelectedBranch(result.trace, 'Usage quota', 'Overage allowed')).toBe(true);
    expect(hasRun(result.trace, 'Mark overage')).toBe(true);
  });

  it('uses otherwise and can reach a failing stage', async () => {
    const result = await build().run({
      usage: { used: 20, limit: 10 },
      allowsOverage: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('QUOTA_EXCEEDED');
  });

  it('throws branch_unmatched when no case matches and no otherwise', async () => {
    const f = flow<Ctx, string>('NoOtherwise')
      .stage('Gate')
      .branch('Pick', (b) =>
        b.when('never', () => false).goTo('End'),
      )
      .stage('End')
      .do(mark('end'))
      .output((ctx) => ctx.path ?? 'none');
    const result = await f.run({
      usage: { used: 0, limit: 0 },
      allowsOverage: false,
    });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('branch_unmatched');
  });

  it('supports inline do action in a branch', async () => {
    const f = flow<Ctx, string>('InlineDo')
      .stage('Gate')
      .branch('Pick', (b) =>
        b.otherwise().do(mark('inline')),
      )
      .output((ctx) => ctx.path ?? 'none');
    const result = await f.run({
      usage: { used: 0, limit: 0 },
      allowsOverage: false,
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('inline');
  });
});
