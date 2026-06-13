import { bench, describe } from 'vitest';
import { flow, operation } from '../src/index.js';

interface Ctx {
  n: number;
}

const noop = (i: number) =>
  operation<Ctx>(`op-${i}`).handler((ctx) => {
    ctx.n++;
  });

function linearFlow(count: number) {
  let f = flow<Ctx, number>(`linear-${count}`).stage('Run');
  for (let i = 0; i < count; i++) f = f.do(noop(i));
  return f.output((ctx) => ctx.n);
}

const linear100 = linearFlow(100);
const linear1000 = linearFlow(1000);

const repeat500 = flow<Ctx, number>('repeat-500')
  .stage('Loop')
  .repeat('Spin', (r) => r.maxAttempts(500).do(noop(0)))
  .output((ctx) => ctx.n);

function parallelFlow(count: number) {
  return flow<Ctx, number>('parallel-100')
    .stage('Run')
    .parallel('All', (p) => {
      for (let i = 0; i < count; i++) p.do(noop(i));
    })
    .output((ctx) => ctx.n);
}
const parallel100 = parallelFlow(100);

describe('runtime overhead', () => {
  bench('linear-100-ops', async () => {
    await linear100.run({ n: 0 });
  });
  bench('linear-1000-ops', async () => {
    await linear1000.run({ n: 0 });
  });
  bench('repeat-500-iterations', async () => {
    await repeat500.run({ n: 0 }, { maxSteps: 1_000_000 });
  });
  bench('parallel-100-ops', async () => {
    await parallel100.run({ n: 0 });
  });
});
