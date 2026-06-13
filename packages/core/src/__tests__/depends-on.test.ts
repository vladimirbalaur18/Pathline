import { describe, expect, it, vi } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';

interface Ctx {
  out?: string;
}

interface Deps {
  billingService: { charge: () => string };
  authService: { whoami: () => string };
}

describe('dependsOn dependency scoping', () => {
  it('narrows handler deps to declared keys (type-level) and runs', async () => {
    const op = operation<Ctx, Deps>('Charge')
      .dependsOn('billingService')
      .handler((_ctx, deps) => ({ out: deps.billingService.charge() }));

    const f = flow<Ctx, string, Deps>('Bill')
      .stage('Run')
      .do(op)
      .output((ctx) => ctx.out!)
      .withDependencies({
        billingService: { charge: () => 'charged' },
        authService: { whoami: () => 'u1' },
      });

    const result = await f.run({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe('charged');
  });

  it('flags using an undeclared dependency as a TYPE error', () => {
    operation<Ctx, Deps>('Bad')
      .dependsOn('billingService')
      // @ts-expect-error - authService was not declared via dependsOn()
      .handler((_ctx, deps) => ({ out: deps.authService.whoami() }));
  });

  it('flags declaring a key not on TDeps as a TYPE error', () => {
    operation<Ctx, Deps>('Bad')
      // @ts-expect-error - 'nope' is not a key of Deps
      .dependsOn('nope')
      .handler(() => {});
  });

  it('keeps full deps available when dependsOn is never called', async () => {
    const op = operation<Ctx, Deps>('No declarations').handler((_ctx, deps) => ({
      out: deps.authService.whoami(),
    }));
    const f = flow<Ctx, string, Deps>('Free')
      .stage('Run')
      .do(op)
      .output((ctx) => ctx.out!)
      .withDependencies({
        billingService: { charge: () => 'c' },
        authService: { whoami: () => 'me' },
      });
    const result = await f.run({});
    expect(result.output).toBe('me');
  });

  it('accumulates keys across multiple dependsOn calls', async () => {
    const op = operation<Ctx, Deps>('Both')
      .dependsOn('billingService')
      .dependsOn('authService')
      .handler((_ctx, deps) => ({
        out: `${deps.authService.whoami()}:${deps.billingService.charge()}`,
      }));
    const f = flow<Ctx, string, Deps>('Both')
      .stage('Run')
      .do(op)
      .output((ctx) => ctx.out!)
      .withDependencies({
        billingService: { charge: () => 'c' },
        authService: { whoami: () => 'me' },
      });
    const result = await f.run({});
    expect(result.output).toBe('me:c');
  });

  it('warns (dev/test) when a declared dependency is never used', async () => {
    const warn = vi.fn();
    const op = operation<Ctx, Deps>('Unused dep')
      .dependsOn('billingService', 'authService')
      .handler((_ctx, deps) => ({ out: deps.billingService.charge() }));
    const f = flow<Ctx, string, Deps>('Warns')
      .stage('Run')
      .do(op)
      .output((ctx) => ctx.out!)
      .withDependencies({
        billingService: { charge: () => 'c' },
        authService: { whoami: () => 'me' },
      });

    await f.run({}, { logger: { warn } });

    expect(warn).toHaveBeenCalledOnce();
    const [message, meta] = warn.mock.calls[0]!;
    expect(message).toContain('Unused dep');
    expect(message).toContain('authService');
    expect((meta as { unused: string[] }).unused).toEqual(['authService']);
  });

  it('does not warn when all declared dependencies are used', async () => {
    const warn = vi.fn();
    const op = operation<Ctx, Deps>('All used')
      .dependsOn('billingService')
      .handler((_ctx, deps) => ({ out: deps.billingService.charge() }));
    const f = flow<Ctx, string, Deps>('NoWarn')
      .stage('Run')
      .do(op)
      .output((ctx) => ctx.out!)
      .withDependencies({
        billingService: { charge: () => 'c' },
        authService: { whoami: () => 'me' },
      });

    await f.run({}, { logger: { warn } });
    expect(warn).not.toHaveBeenCalled();
  });
});
