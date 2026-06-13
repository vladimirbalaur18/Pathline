import { describe, expect, it, vi } from 'vitest';
import { operation } from '../operation/operation.js';

interface Ctx {
  id?: string;
  user?: { id: string };
  count?: number;
}

interface Deps {
  userService: { find: (id: string) => Promise<{ id: string }> };
}

describe('operation builder', () => {
  it('captures metadata: id, reads, writes, dependsOn, tags', () => {
    const op = operation<Ctx, Deps>('Load user', { id: 'load-user' })
      .reads('id')
      .writes('user')
      .dependsOn('userService')
      .tags('users', 'read')
      .metadata({ external: false })
      .handler(() => {});

    expect(op.id).toBe('load-user');
    expect(op.name).toBe('Load user');
    expect(op.reads).toEqual(['id']);
    expect(op.writes).toEqual(['user']);
    expect(op.dependsOn).toEqual(['userService']);
    expect(op.tags).toEqual(['users', 'read']);
    expect(op.metadata).toEqual({ external: false });
  });

  it('defaults id to a slug of the name', () => {
    const op = operation('Authorize Overage Charge!').handler(() => {});
    expect(op.id).toBe('authorize-overage-charge');
  });

  it('runs in isolation via run() with mutation style', async () => {
    const op = operation<Ctx, Deps>('Load user')
      .handler(async (ctx, deps) => {
        ctx.user = await deps.userService.find(ctx.id!);
      });

    const ctx: Ctx = { id: 'u1' };
    const deps: Deps = {
      userService: { find: vi.fn().mockResolvedValue({ id: 'u1' }) },
    };
    await op.run(ctx, deps);
    expect(ctx.user).toEqual({ id: 'u1' });
  });

  it('merges a returned patch into context', async () => {
    const op = operation<Ctx, Deps>('Set count').handler(() => ({ count: 5 }));
    const ctx: Ctx = {};
    await op.run(ctx, {} as Deps);
    expect(ctx.count).toBe(5);
  });
});
