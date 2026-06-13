import { buildGenerateScheduleFlow } from './scheduling.flow.js';
import { createSchedulingDeps } from './scheduling.services.js';

async function main(): Promise<void> {
  const deps = createSchedulingDeps();
  const flow = buildGenerateScheduleFlow(deps);

  console.log(flow.describe());

  const result = await flow.run({
    input: { employees: ['Ana', 'Ben', 'Cara', 'Dan'], days: 8, shiftsPerDay: 2, seed: 7 },
    bestScore: Number.POSITIVE_INFINITY,
    attempts: 0,
    usedFallback: false,
  });

  console.log('\n--- Result ---');
  console.log(JSON.stringify({ ok: result.ok, output: result.output }, null, 2));

  if (!result.ok) {
    console.log('\n--- Failure trace ---');
    console.log(JSON.stringify(result.error, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
