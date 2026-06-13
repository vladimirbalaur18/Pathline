import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';

interface SubCtx {
  value: number;
  sub?: number;
}

interface ParentCtx {
  value: number;
  sub?: number;
  merged?: number;
}

const subflow = flow<SubCtx, number>('Compute sub')
  .stage('Compute')
  .do(operation<SubCtx>('Add ten').handler((ctx) => ({ sub: ctx.value + 10 })))
  .output((ctx) => ctx.sub!);

describe('subflow execution', () => {
  it('runs a subflow with shared context and maps output', async () => {
    const parent = flow<ParentCtx, number>('Parent')
      .stage('Run sub')
      .subflow(subflow, {
        mapOutput: (_ctx, output) => ({ merged: output as number }),
      })
      .output((ctx) => ctx.merged!);

    const result = await parent.run({ value: 5 });
    expect(result.ok).toBe(true);
    expect(result.output).toBe(15);
  });

  it('fails the parent when the subflow fails', async () => {
    const failing = flow<SubCtx, number>('Failing sub')
      .stage('Boom')
      .do(operation<SubCtx>('Boom').handler(() => { throw new Error('sub boom'); }))
      .output((ctx) => ctx.sub!);

    const parent = flow<ParentCtx, number>('Parent')
      .stage('Run sub')
      .subflow(failing)
      .output((ctx) => ctx.value);

    const result = await parent.run({ value: 1 });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('FLOW_SUBFLOW_FAILED');
  });

  it('describe()/toGraph() include subflow and goto/fail nodes', () => {
    const f = flow<ParentCtx, number>('WithSub')
      .stage('A')
      .subflow(subflow)
      .goTo('C')
      .stage('B')
      .fail({ code: 'X', message: 'bad' })
      .stage('C')
      .do(operation<ParentCtx>('done').handler(() => {}))
      .output((ctx) => ctx.value);

    const text = f.describe();
    expect(text).toContain('- Subflow: Compute sub');
    expect(text).toContain('- Go to: C');
    expect(text).toContain('- Fail: X');

    const graph = f.toGraph();
    expect(graph.nodes.some((n) => n.kind === 'subflow')).toBe(true);
    expect(f.toMermaid()).toContain('flowchart TD');
  });
});
