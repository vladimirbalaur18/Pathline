import { guessNumberFlow, type GuessContext } from './guess-number.flow.js';

async function main(): Promise<void> {
  // Pathline is not Nest-only: here we run a flow directly in plain Node.
  console.log(guessNumberFlow.describe());
  console.log('\n--- Mermaid ---\n');
  console.log(guessNumberFlow.toMermaid());

  const initial: Partial<GuessContext> = {
    secret: 73,
    low: 1,
    high: 100,
    attempts: 0,
    found: false,
  };

  const result = await guessNumberFlow.run(initial);

  console.log('\n--- Result ---');
  console.log(JSON.stringify({ ok: result.ok, output: result.output, runId: result.runId }, null, 2));
  console.log('\n--- Trace (summarized) ---');
  for (const event of result.trace) {
    console.log(`${event.kind.padEnd(10)} ${event.status.padEnd(10)} ${event.message ?? event.operationName ?? ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
