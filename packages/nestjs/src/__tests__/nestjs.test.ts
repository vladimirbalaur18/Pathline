import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { flow, operation, FlowHttpError } from '@pathline/core';
import { FlowRunner } from '../flow-runner.js';
import { FlowHttpExceptionFilter } from '../flow-exception.filter.js';
import { PathlineModule } from '../pathline.module.js';

interface Ctx {
  value: number;
  out?: number;
}

const sample = flow<Ctx, number>('Sample')
  .stage('Compute')
  .do(operation<Ctx>('Double').handler((ctx) => { ctx.out = ctx.value * 2; }))
  .output((ctx) => ctx.out!);

describe('@pathline/nestjs', () => {
  it('FlowRunner runs a flow and returns a result', async () => {
    const runner = new FlowRunner({});
    const result = await runner.run(sample, { value: 5 });
    expect(result.ok).toBe(true);
    expect(result.output).toBe(10);
  });

  it('FlowRunner forwards onTrace from module options', async () => {
    const onTrace = vi.fn();
    const runner = new FlowRunner({ tracing: true, onTrace });
    await runner.run(sample, { value: 1 });
    expect(onTrace).toHaveBeenCalled();
  });

  it('FlowRunner suppresses onTrace when tracing is disabled', async () => {
    const onTrace = vi.fn();
    const runner = new FlowRunner({ tracing: false, onTrace });
    await runner.run(sample, { value: 1 });
    expect(onTrace).not.toHaveBeenCalled();
  });

  it('FlowHttpExceptionFilter maps FlowHttpError to an HTTP response', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    const filter = new FlowHttpExceptionFilter();
    filter.catch(
      new FlowHttpError({ statusCode: 402, code: 'QUOTA', message: 'over quota' }),
      host,
    );
    expect(status).toHaveBeenCalledWith(402);
    expect(json).toHaveBeenCalledWith({
      code: 'QUOTA',
      message: 'over quota',
      details: undefined,
    });
  });

  it('PathlineModule.forRoot returns a global dynamic module', () => {
    const mod = PathlineModule.forRoot({ tracing: true });
    expect(mod.module).toBe(PathlineModule);
    expect(mod.global).toBe(true);
    expect(mod.exports).toContain(FlowRunner);
  });
});
