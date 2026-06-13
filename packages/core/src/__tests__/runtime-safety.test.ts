import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';

interface Ctx {
  n: number;
}

describe('runtime safety: maxSteps, cancellation, timeout, retry', () => {
  it('enforces maxSteps to guard runaway loops', async () => {
    const f = flow<Ctx, number>('Loop')
      .stage('Loop')
      .repeat('Spin', (r) =>
        r.maxAttempts(1_000_000).do(
          operation<Ctx>('Tick').handler((ctx) => { ctx.n++; }),
        ),
      )
      .output((ctx) => ctx.n);
    const result = await f.run({ n: 0 }, { maxSteps: 50 });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('max_steps_exceeded');
  });

  it('cancels via AbortSignal', async () => {
    const controller = new AbortController();
    const f = flow<Ctx, number>('Cancel')
      .stage('Slow')
      .do(
        operation<Ctx>('Slow op').handler(async (_ctx, _deps, runtime) => {
          await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, 1000);
            runtime.signal?.addEventListener('abort', () => {
              clearTimeout(t);
              reject(new Error('aborted'));
            });
          });
        }),
      )
      .output((ctx) => ctx.n);

    setTimeout(() => controller.abort(), 20);
    const result = await f.run({ n: 0 }, { signal: controller.signal });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('cancelled');
  });

  it('times out a hanging operation', async () => {
    const f = flow<Ctx, number>('Timeout')
      .stage('Hang')
      .do(
        operation<Ctx>('Hang')
          .timeoutMs(30)
          .handler(() => new Promise<void>(() => {})),
      )
      .output((ctx) => ctx.n);
    const result = await f.run({ n: 0 });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('timeout');
  });

  it('retries a flaky operation and eventually succeeds', async () => {
    let calls = 0;
    const f = flow<Ctx, number>('Retry')
      .stage('Call')
      .do(
        operation<Ctx>('Flaky')
          .retry({ attempts: 3, backoff: 'none' })
          .handler((ctx) => {
            calls++;
            if (calls < 3) throw new Error('transient');
            ctx.n = calls;
          }),
      )
      .output((ctx) => ctx.n);
    const result = await f.run({ n: 0 });
    expect(result.ok).toBe(true);
    expect(result.output).toBe(3);
  });

  it('respects retryOn predicate', async () => {
    let calls = 0;
    const f = flow<Ctx, number>('Retry')
      .stage('Call')
      .do(
        operation<Ctx>('Flaky')
          .retry({ attempts: 5, backoff: 'none', retryOn: (e) => (e as Error).message === 'retry-me' })
          .handler(() => {
            calls++;
            throw new Error('do-not-retry');
          }),
      )
      .output((ctx) => ctx.n);
    const result = await f.run({ n: 0 });
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });
});
