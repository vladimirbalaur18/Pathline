import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';
import { hasRunCompensation, hasRunFinally } from '../testing/helpers.js';

interface Ctx {
  reserved?: boolean;
  released?: boolean;
  cleaned?: boolean;
  ran?: boolean;
}

describe('failure, compensation, and finally', () => {
  it('runs compensation on failure and preserves the primary error', async () => {
    const f = flow<Ctx, Ctx>('Reserve')
      .stage('Reserve')
      .do(operation<Ctx>('Reserve usage').handler((ctx) => { ctx.reserved = true; }))
      .stage('Execute')
      .do(operation<Ctx>('Run').handler(() => { throw new Error('execution failed'); }))
      .onFailure()
      .do(operation<Ctx>('Release reserved usage').handler((ctx) => { ctx.released = true; }))
      .output((ctx) => ctx);

    const result = await f.run({});
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('operation_failed');
    expect(result.error?.message).toContain('execution failed');
    expect(hasRunCompensation(result.trace, 'Release reserved usage')).toBe(true);
  });

  it('collects compensation errors without hiding the primary error', async () => {
    const f = flow<Ctx, Ctx>('Reserve')
      .stage('Execute')
      .do(operation<Ctx>('Run').handler(() => { throw new Error('primary'); }))
      .onFailure()
      .do(operation<Ctx>('Comp').handler(() => { throw new Error('comp failed'); }))
      .output((ctx) => ctx);
    const result = await f.run({});
    expect(result.error?.message).toContain('primary');
    expect(result.compensationErrors).toHaveLength(1);
    expect(result.compensationErrors?.[0]?.failureKind).toBe('compensation_failed');
  });

  it('runs finally on success', async () => {
    const f = flow<Ctx, Ctx>('Job')
      .stage('Work')
      .do(operation<Ctx>('Work').handler((ctx) => { ctx.ran = true; }))
      .finally()
      .do(operation<Ctx>('Cleanup').handler((ctx) => { ctx.cleaned = true; }))
      .output((ctx) => ctx);
    const result = await f.run({});
    expect(result.ok).toBe(true);
    expect(result.output?.cleaned).toBe(true);
    expect(hasRunFinally(result.trace, 'Cleanup')).toBe(true);
  });

  it('runs finally on failure too, separate from compensation errors', async () => {
    const f = flow<Ctx, Ctx>('Job')
      .stage('Work')
      .do(operation<Ctx>('Work').handler(() => { throw new Error('boom'); }))
      .finally()
      .do(operation<Ctx>('Cleanup').handler((ctx) => { ctx.cleaned = true; }))
      .output((ctx) => ctx);
    const result = await f.run({});
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('operation_failed');
    expect(hasRunFinally(result.trace, 'Cleanup')).toBe(true);
  });

  it('success + finally failure => ok:false, finally_failed, output preserved', async () => {
    const f = flow<Ctx, Ctx>('Job')
      .stage('Work')
      .do(operation<Ctx>('Work').handler((ctx) => { ctx.ran = true; }))
      .finally()
      .do(operation<Ctx>('Cleanup').handler(() => { throw new Error('cleanup failed'); }))
      .output((ctx) => ({ ...ctx }));
    const result = await f.run({});
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('finally_failed');
    expect(result.output?.ran).toBe(true);
    expect(result.finallyErrors).toHaveLength(1);
  });
});
