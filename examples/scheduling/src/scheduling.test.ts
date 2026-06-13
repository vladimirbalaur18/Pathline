import { describe, expect, it } from 'vitest';
import { hasRun, hasRunCompensation } from '@pathline/core/testing';
import { buildGenerateScheduleFlow } from './scheduling.flow.js';
import { createSchedulingDeps } from './scheduling.services.js';
import type { GenerateScheduleContext } from './scheduling.flow.js';

const baseCtx = (
  overrides: Partial<GenerateScheduleContext['input']> = {},
): Partial<GenerateScheduleContext> => ({
  input: { employees: ['Ana', 'Ben', 'Cara', 'Dan'], days: 8, shiftsPerDay: 2, seed: 7, ...overrides },
  bestScore: Number.POSITIVE_INFINITY,
  attempts: 0,
  usedFallback: false,
});

describe('scheduling example', () => {
  it('validates the flow structure', () => {
    const flow = buildGenerateScheduleFlow(createSchedulingDeps());
    const result = flow.validate();
    expect(result.ok).toBe(true);
  });

  it('generates and exports a balanced schedule', async () => {
    const deps = createSchedulingDeps();
    const flow = buildGenerateScheduleFlow(deps);
    const result = await flow.run(baseCtx());

    expect(result.ok).toBe(true);
    expect(result.output?.scheduleId).toMatch(/^sched_/);
    expect(result.output!.score).toBeGreaterThanOrEqual(0);
    expect(deps.exported.length).toBe(1);
  });

  it('rejects invalid input and runs the failure compensation', async () => {
    const deps = createSchedulingDeps();
    const flow = buildGenerateScheduleFlow(deps);
    const result = await flow.run({ ...baseCtx(), input: { employees: [], days: 1, shiftsPerDay: 1, seed: 1 } });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_SCHEDULE_INPUT');
    expect(hasRun(result.trace, 'Export schedule')).toBe(false);
    expect(hasRunCompensation(result.trace, 'Write failure audit log')).toBe(true);
  });

  it('falls back when no perfectly valid schedule is found', async () => {
    const deps = createSchedulingDeps();
    const flow = buildGenerateScheduleFlow(deps);
    // shiftsPerDay > employees forces every day to be invalid -> fallback path.
    const result = await flow.run({ ...baseCtx(), input: { employees: ['Ana', 'Ben'], days: 3, shiftsPerDay: 3, seed: 3 } });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NO_SCHEDULE_FOUND');
  });
});
