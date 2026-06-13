import { describe, expect, it } from 'vitest';
import { guard } from '../guard/guard.js';
import { FlowError } from '../errors/index.js';

interface Ctx {
  status: string;
}

describe('guard builder', () => {
  it('builds a guard with a check function', async () => {
    const g = guard<Ctx>('Active')
      .check((ctx) => ctx.status === 'active')
      .build();
    expect(g.name).toBe('Active');
    expect(await g.check({ status: 'active' }, {})).toBe(true);
    expect(await g.check({ status: 'inactive' }, {})).toBe(false);
  });

  it('attaches a custom deny handler via denyWith', () => {
    const g = guard<Ctx>('Active')
      .check((ctx) => ctx.status === 'active')
      .denyWith(() => {
        throw new FlowError({ message: 'denied' });
      });
    expect(g.deny).toBeTypeOf('function');
  });

  it('throws if built without a check', () => {
    expect(() => guard('Incomplete').build()).toThrow(/missing a check/);
  });
});
