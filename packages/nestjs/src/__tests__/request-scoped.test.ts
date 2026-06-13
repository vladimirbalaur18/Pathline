import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { flow, operation } from '@pathline/core';
import { RequestScopedFlowRunner } from '../request-scoped-flow-runner.js';

interface Ctx {
  out?: string;
}
interface Deps {
  greeter: { greet: () => string };
}

const sample = flow<Ctx, string, Deps>('Greet')
  .stage('Run')
  .do(
    operation<Ctx, Deps>('Greet')
      .dependsOn('greeter')
      .handler((ctx, deps) => { ctx.out = deps.greeter.greet(); }),
  )
  .output((ctx) => ctx.out!);

describe('RequestScopedFlowRunner', () => {
  it('binds per-request dependencies before running', async () => {
    const runner = new RequestScopedFlowRunner({});
    const result = await runner.runWith(
      sample,
      { greeter: { greet: () => 'hello-request' } },
      {},
    );
    expect(result.ok).toBe(true);
    expect(result.output).toBe('hello-request');
  });

  it('uses distinct deps per call', async () => {
    const runner = new RequestScopedFlowRunner({});
    const a = await runner.runWith(sample, { greeter: { greet: () => 'A' } }, {});
    const b = await runner.runWith(sample, { greeter: { greet: () => 'B' } }, {});
    expect(a.output).toBe('A');
    expect(b.output).toBe('B');
  });
});
