import { describe, expect, it } from 'vitest';
import { guessNumberFlow } from './guess-number.flow.js';

describe('basic-node example: guess the number', () => {
  it('finds the secret within the search budget', async () => {
    const result = await guessNumberFlow.run({
      secret: 73,
      low: 1,
      high: 100,
      attempts: 0,
      found: false,
    });
    expect(result.ok).toBe(true);
    expect(result.output?.found).toBe(true);
    expect(result.output?.guess).toBe(73);
    expect(result.output!.attempts).toBeLessThanOrEqual(7);
  });

  it('validates cleanly', () => {
    expect(guessNumberFlow.validate().ok).toBe(true);
  });
});
