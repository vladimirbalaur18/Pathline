import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';

interface Ctx {
  attempts: number;
  best: number;
  candidate?: number;
}

describe('repeat flow execution', () => {
  it('stops on maxAttempts', async () => {
    const f = flow<Ctx, number>('Search')
      .stage('Search')
      .repeat('Generate', (r) =>
        r.maxAttempts(5).do(
          operation<Ctx>('Attempt').handler((ctx) => {
            ctx.attempts++;
          }),
        ),
      )
      .output((ctx) => ctx.attempts);
    const result = await f.run({ attempts: 0, best: 0 });
    expect(result.ok).toBe(true);
    expect(result.output).toBe(5);
  });

  it('stops on stopWhen', async () => {
    const f = flow<Ctx, number>('Search')
      .stage('Search')
      .repeat('Generate', (r) =>
        r
          .maxAttempts(100)
          .stopWhen('reached 3', (ctx) => ctx.attempts >= 3)
          .do(operation<Ctx>('Attempt').handler((ctx) => { ctx.attempts++; })),
      )
      .output((ctx) => ctx.attempts);
    const result = await f.run({ attempts: 0, best: 0 });
    expect(result.output).toBe(3);
  });

  it('supports continueRepeat and stopRepeat via branch', async () => {
    const f = flow<Ctx, number>('Search')
      .stage('Search')
      .repeat('Generate', (r) =>
        r
          .maxAttempts(100)
          .do(operation<Ctx>('Build').handler((ctx) => { ctx.attempts++; ctx.candidate = ctx.attempts; }))
          .branch('Check', (b) =>
            b
              .when('reached 4', (ctx) => ctx.attempts >= 4)
              .stopRepeat()
              .otherwise()
              .continueRepeat(),
          ),
      )
      .output((ctx) => ctx.attempts);
    const result = await f.run({ attempts: 0, best: 0 });
    expect(result.output).toBe(4);
  });

  it('summarizes repeat trace by default', async () => {
    const f = flow<Ctx, number>('Search')
      .stage('Search')
      .repeat('Generate', (r) =>
        r.maxAttempts(10).do(operation<Ctx>('Attempt').handler((ctx) => { ctx.attempts++; })),
      )
      .output((ctx) => ctx.attempts);
    const result = await f.run({ attempts: 0, best: 0 });
    const opEvents = result.trace.filter((e) => e.operationName === 'Attempt');
    expect(opEvents.length).toBe(0);
    const repeatDone = result.trace.find((e) => e.kind === 'repeat' && e.status === 'completed');
    expect(repeatDone?.attempts).toBe(10);
    expect(repeatDone?.childrenPolicy).toBe('summary');
  });

  it('keeps full repeat trace when repeatMode is full', async () => {
    const f = flow<Ctx, number>('Search')
      .stage('Search')
      .repeat('Generate', (r) =>
        r.maxAttempts(3).do(operation<Ctx>('Attempt').handler((ctx) => { ctx.attempts++; })),
      )
      .output((ctx) => ctx.attempts);
    const result = await f.run({ attempts: 0, best: 0 }, { trace: { repeatMode: 'full' } });
    const opEvents = result.trace.filter((e) => e.operationName === 'Attempt' && e.status === 'completed');
    expect(opEvents.length).toBe(3);
  });
});
