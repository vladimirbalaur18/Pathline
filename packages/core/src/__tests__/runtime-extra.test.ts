import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';

interface Ctx {
  n: number;
  marked?: string;
}

describe('runtime extra coverage', () => {
  it('applies exponential backoff between retries', async () => {
    let calls = 0;
    const start = Date.now();
    const f = flow<Ctx, number>('Retry')
      .stage('Call')
      .do(
        operation<Ctx>('Flaky')
          .retry({ attempts: 3, backoff: 'exponential', delayMs: 10 })
          .handler((ctx) => {
            calls++;
            if (calls < 3) throw new Error('again');
            ctx.n = calls;
          }),
      )
      .output((ctx) => ctx.n);
    const result = await f.run({ n: 0 });
    expect(result.ok).toBe(true);
    // 10ms + 20ms backoff ~= at least 30ms total
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });

  it('caps trace events with maxEvents', async () => {
    const f = flow<Ctx, number>('Many')
      .stage('A')
      .do(operation<Ctx>('one').handler(() => {}))
      .do(operation<Ctx>('two').handler(() => {}))
      .do(operation<Ctx>('three').handler(() => {}))
      .output((ctx) => ctx.n);
    const result = await f.run({ n: 0 }, { trace: { maxEvents: 3 } });
    expect(result.trace.length).toBe(3);
  });

  it('supports a fail action inside a branch', async () => {
    const f = flow<Ctx, number>('BranchFail')
      .stage('Gate')
      .branch('Pick', (b) =>
        b.otherwise().fail({ statusCode: 418, code: 'TEAPOT', message: 'no' }),
      )
      .output((ctx) => ctx.n);
    const result = await f.run({ n: 0 });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TEAPOT');
    expect(result.error?.statusCode).toBe(418);
  });

  it('repeat body can goTo a stage, breaking the loop', async () => {
    const f = flow<Ctx, string>('RepeatGoto')
      .stage('Loop')
      .repeat('Spin', (r) =>
        r
          .maxAttempts(10)
          .do(operation<Ctx>('Tick').handler((ctx) => { ctx.n++; }))
          .branch('Check', (b) =>
            b.when('reached 2', (ctx) => ctx.n >= 2).goTo('Done').otherwise().continueRepeat(),
          ),
      )
      .stage('Done')
      .do(operation<Ctx>('Finish').handler(() => ({ marked: 'done' })))
      .output((ctx) => ctx.marked!);
    const result = await f.run({ n: 0 });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('done');
  });

  it('default deny throws when a guard has no custom deny handler', async () => {
    const { guard } = await import('../guard/guard.js');
    const g = guard<Ctx>('Always false').check(() => false).build();
    const f = flow<Ctx, number>('GuardDefault')
      .stage('Gate')
      .guard(g)
      .output((ctx) => ctx.n);
    const result = await f.run({ n: 0 });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('guard_denied');
    expect(result.error?.code).toBe('GUARD_DENIED');
  });
});
