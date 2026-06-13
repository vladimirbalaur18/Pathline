import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';

interface Ctx {
  a?: number;
  b?: number;
  c?: number;
}

describe('parallel flow execution', () => {
  it('runs operations concurrently and merges results', async () => {
    const order: string[] = [];
    const mk = (key: 'a' | 'b' | 'c', delay: number) =>
      operation<Ctx>(`Load ${key}`)
        .writes(key)
        .handler(async (ctx) => {
          await new Promise((r) => setTimeout(r, delay));
          order.push(key);
          ctx[key] = delay;
        });

    const f = flow<Ctx, Ctx>('Parallel')
      .stage('Load')
      .parallel('Load all', (p) =>
        p.do(mk('a', 30)).do(mk('b', 10)).do(mk('c', 20)),
      )
      .output((ctx) => ctx);

    const result = await f.run({});
    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ a: 30, b: 10, c: 20 });
    expect(order).toEqual(['b', 'c', 'a']);
  });

  it('failFast surfaces the first error', async () => {
    const f = flow<Ctx, Ctx>('Parallel')
      .stage('Load')
      .parallel('Load all', (p) =>
        p
          .mode('failFast')
          .do(operation<Ctx>('ok').handler(() => {}))
          .do(
            operation<Ctx>('boom').handler(() => {
              throw new Error('boom');
            }),
          ),
      )
      .output((ctx) => ctx);
    const result = await f.run({});
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('operation_failed');
  });

  it('collectAll aggregates all errors', async () => {
    const f = flow<Ctx, Ctx>('Parallel')
      .stage('Load')
      .parallel('Load all', (p) =>
        p
          .mode('collectAll')
          .do(operation<Ctx>('boom1').handler(() => { throw new Error('1'); }))
          .do(operation<Ctx>('boom2').handler(() => { throw new Error('2'); })),
      )
      .output((ctx) => ctx);
    const result = await f.run({});
    expect(result.ok).toBe(false);
    expect((result.error?.details as unknown[]).length).toBe(2);
  });

  it('respects a concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    const mk = (i: number) =>
      operation<Ctx>(`op${i}`).handler(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      });
    const f = flow<Ctx, Ctx>('Parallel')
      .stage('Load')
      .parallel('Load all', (p) =>
        p.concurrency(2).do(mk(1)).do(mk(2)).do(mk(3)).do(mk(4)),
      )
      .output((ctx) => ctx);
    await f.run({});
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
