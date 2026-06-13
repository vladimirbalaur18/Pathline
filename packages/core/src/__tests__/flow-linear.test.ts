import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';
import { guard } from '../guard/guard.js';
import { FlowHttpError } from '../errors/index.js';
import { hasCompleted, hasRun } from '../testing/helpers.js';

interface Ctx {
  input: { value: number };
  doubled?: number;
  response?: { result: number };
}

const double = operation<Ctx>('Double')
  .reads('input')
  .writes('doubled')
  .handler((ctx) => {
    ctx.doubled = ctx.input.value * 2;
  });

const serialize = operation<Ctx>('Serialize').handler((ctx) => ({
  response: { result: ctx.doubled! },
}));

describe('linear flow execution', () => {
  it('runs stages in order and resolves output', async () => {
    const f = flow<Ctx, { result: number }>('Compute')
      .stage('Compute')
      .do(double)
      .stage('Finalize')
      .do(serialize)
      .output((ctx) => ctx.response!);

    const result = await f.run({ input: { value: 21 } });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ result: 42 });
    expect(result.failureKind).toBeUndefined();
    expect(result.runId).toMatch(/^run_/);
    expect(result.definitionHash).toHaveLength(8);
    expect(hasCompleted(result.trace, 'Double')).toBe(true);
    expect(hasRun(result.trace, 'Serialize')).toBe(true);
  });

  it('denies via guard and reports guard_denied', async () => {
    const allow = guard<Ctx>('Value positive')
      .check((ctx) => ctx.input.value > 0)
      .denyWith(() => {
        throw new FlowHttpError({
          statusCode: 400,
          code: 'NEGATIVE',
          message: 'Value must be positive',
        });
      });

    const f = flow<Ctx, { result: number }>('Compute')
      .stage('Validate')
      .guard(allow)
      .stage('Compute')
      .do(double)
      .output((ctx) => ({ result: ctx.doubled! }));

    const result = await f.run({ input: { value: -1 } });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('guard_denied');
    expect(result.error?.code).toBe('NEGATIVE');
    expect(hasRun(result.trace, 'Double')).toBe(false);
  });

  it('does not serialize the full context into the trace', async () => {
    const f = flow<Ctx, number>('Compute')
      .stage('Compute')
      .do(double)
      .output((ctx) => ctx.doubled!);
    const result = await f.run({ input: { value: 5 } });
    const serialized = JSON.stringify(result.trace);
    expect(serialized).not.toContain('"value"');
  });
});
