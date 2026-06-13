import { describe, expect, it, vi } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';

interface Ctx {
  input: string;
  out?: string;
  extra?: string;
}

interface Deps {
  billingService: { charge: () => string };
}

describe('reads / writes declaration tracking', () => {
  it('flags an undeclared key in a returned patch as a TYPE error', () => {
    operation<Ctx, Deps>('Bad patch')
      .writes('out')
      // @ts-expect-error - extra was not declared via writes()
      .handler(() => ({ extra: 'nope' }));
  });

  it('warns when a declared read is never used (dev/test)', async () => {
    const warn = vi.fn();
    const op = operation<Ctx, Deps>('Unused read')
      .reads('input', 'out')
      .handler((ctx) => ({ out: ctx.input }));
    const f = flow<Ctx, string, Deps>('Warn read')
      .stage('Run')
      .do(op)
      .output((ctx) => ctx.out!)
      .withDependencies({ billingService: { charge: () => 'c' } });

    await f.run({ input: 'hi' }, { logger: { warn } });

    expect(warn).toHaveBeenCalled();
    const [, meta] = warn.mock.calls.find(
      ([, m]) => (m as { code?: string }).code === 'UNUSED_CONTEXT_READ',
    )!;
    expect((meta as { unused: string[] }).unused).toEqual(['out']);
  });

  it('warns when an undeclared context key is read (dev/test)', async () => {
    const warn = vi.fn();
    const op = operation<Ctx, Deps>('Undeclared read')
      .reads('input')
      .handler((ctx) => ({ out: `${ctx.input}:${ctx.extra ?? ''}` }));
    const f = flow<Ctx, string, Deps>('Warn undeclared read')
      .stage('Run')
      .do(op)
      .output((ctx) => ctx.out!)
      .withDependencies({ billingService: { charge: () => 'c' } });

    await f.run({ input: 'hi', extra: 'x' }, { logger: { warn } });

    const [, meta] = warn.mock.calls.find(
      ([, m]) => (m as { code?: string }).code === 'UNDECLARED_CONTEXT_READ',
    )!;
    expect((meta as { undeclared: string[] }).undeclared).toEqual(['extra']);
  });

  it('warns when a declared write is never produced (dev/test)', async () => {
    const warn = vi.fn();
    const op = operation<Ctx, Deps>('Unused write')
      .writes('out', 'extra')
      .handler(() => ({ out: 'done' }));
    const f = flow<Ctx, string, Deps>('Warn write')
      .stage('Run')
      .do(op)
      .output((ctx) => ctx.out!)
      .withDependencies({ billingService: { charge: () => 'c' } });

    await f.run({ input: 'hi' }, { logger: { warn } });

    const [, meta] = warn.mock.calls.find(
      ([, m]) => (m as { code?: string }).code === 'UNUSED_CONTEXT_WRITE',
    )!;
    expect((meta as { unused: string[] }).unused).toEqual(['extra']);
  });

  it('warns when ctx is mutated on an undeclared write key (dev/test)', async () => {
    const warn = vi.fn();
    const op = operation<Ctx, Deps>('Undeclared write')
      .writes('out')
      .handler((ctx) => {
        ctx.extra = 'surprise';
        return { out: 'done' };
      });
    const f = flow<Ctx, string, Deps>('Warn undeclared write')
      .stage('Run')
      .do(op)
      .output((ctx) => ctx.out!)
      .withDependencies({ billingService: { charge: () => 'c' } });

    await f.run({ input: 'hi' }, { logger: { warn } });

    const [, meta] = warn.mock.calls.find(
      ([, m]) => (m as { code?: string }).code === 'UNDECLARED_CONTEXT_WRITE',
    )!;
    expect((meta as { undeclared: string[] }).undeclared).toEqual(['extra']);
  });
});
