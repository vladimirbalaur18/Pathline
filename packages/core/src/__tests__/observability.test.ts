import { describe, expect, it, vi } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';
import type { FlowTraceEvent } from '../types.js';

interface Ctx {
  ran?: boolean;
}

describe('observability hooks and onTrace', () => {
  it('invokes lifecycle hooks in order', async () => {
    const calls: string[] = [];
    const f = flow<Ctx, Ctx>('Hooks')
      .stage('Work')
      .do(operation<Ctx>('Work').handler((ctx) => { ctx.ran = true; }))
      .output((ctx) => ctx);

    await f.run(
      {},
      {
        hooks: {
          beforeFlow: () => { calls.push('beforeFlow'); },
          onFlowStart: () => { calls.push('onFlowStart'); },
          beforeOperation: (e) => { calls.push(`beforeOp:${e.operationName}`); },
          afterOperation: (e) => { calls.push(`afterOp:${e.operationName}`); },
          onFlowComplete: () => { calls.push('onFlowComplete'); },
          afterFlow: () => { calls.push('afterFlow'); },
        },
      },
    );

    expect(calls).toEqual([
      'beforeFlow',
      'onFlowStart',
      'beforeOp:Work',
      'afterOp:Work',
      'onFlowComplete',
      'afterFlow',
    ]);
  });

  it('streams trace events via onTrace', async () => {
    const events: FlowTraceEvent[] = [];
    const onTrace = vi.fn((e: FlowTraceEvent) => { events.push(e); });
    const f = flow<Ctx, Ctx>('Trace')
      .stage('Work')
      .do(operation<Ctx>('Work').handler(() => {}))
      .output((ctx) => ctx);
    await f.run({}, { onTrace });
    expect(onTrace).toHaveBeenCalled();
    expect(events.some((e) => e.kind === 'flow' && e.status === 'started')).toBe(true);
    expect(events.every((e) => e.runId.startsWith('run_'))).toBe(true);
  });

  it('calls onFlowFail on failure', async () => {
    const onFlowFail = vi.fn();
    const f = flow<Ctx, Ctx>('Fail')
      .stage('Work')
      .do(operation<Ctx>('Work').handler(() => { throw new Error('boom'); }))
      .output((ctx) => ctx);
    await f.run({}, { hooks: { onFlowFail } });
    expect(onFlowFail).toHaveBeenCalledOnce();
  });
});
