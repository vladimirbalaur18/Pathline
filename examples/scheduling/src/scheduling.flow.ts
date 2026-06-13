import {
  flow,
  guard,
  operation,
  type ExecutableFlow,
  FlowHttpError,
} from '@pathline/core';
import { mulberry32 } from './scheduling.services.js';
import type {
  Candidate,
  SchedulingContext,
  SchedulingDeps,
  ScheduleResponse,
} from './scheduling.types.js';

type Ctx = SchedulingContext & { fallback?: Candidate };

const hasEmployees = guard<Ctx, SchedulingDeps>('Input has employees')
  .check((ctx) => ctx.input.employees.length > 0 && ctx.input.shiftsPerDay > 0)
  .denyWith(() => {
    throw new FlowHttpError({
      statusCode: 422,
      code: 'INVALID_SCHEDULE_INPUT',
      message: 'At least one employee and one shift per day are required',
    });
  });

const resetGenerationState = operation<Ctx, SchedulingDeps>('Reset generation state')
  .writes('candidate')
  .handler((ctx) => {
    ctx.candidate = undefined;
  });

const buildCandidateSchedule = operation<Ctx, SchedulingDeps>('Build candidate schedule')
  .reads('input', 'attempts')
  .writes('candidate')
  .handler((ctx) => {
    const { employees, days, shiftsPerDay, seed } = ctx.input;
    const rand = mulberry32(seed + ctx.attempts * 2654435761);
    const assignments: string[][] = [];
    const load: Record<string, number> = Object.fromEntries(
      employees.map((e) => [e, 0]),
    );
    let valid = true;

    for (let d = 0; d < days; d++) {
      const pool = [...employees];
      const dayAssignment: string[] = [];
      for (let s = 0; s < shiftsPerDay; s++) {
        if (pool.length === 0) {
          valid = false;
          break;
        }
        const idx = Math.floor(rand() * pool.length);
        const picked = pool.splice(idx, 1)[0]!;
        dayAssignment.push(picked);
        load[picked] = (load[picked] ?? 0) + 1;
      }
      assignments.push(dayAssignment);
    }

    const counts = employees.map((e) => load[e] ?? 0);
    const score = Math.max(...counts) - Math.min(...counts);
    ctx.candidate = { assignments, load, score, valid };
  });

const scoreAndKeepBest = operation<Ctx, SchedulingDeps>('Score and keep best')
  .reads('candidate', 'fallback', 'bestScore')
  .writes('best', 'fallback', 'bestScore')
  .handler((ctx) => {
    const candidate = ctx.candidate;
    if (!candidate) return;
    if (!ctx.fallback || candidate.score < ctx.fallback.score) {
      ctx.fallback = candidate;
    }
    if (candidate.valid && candidate.score < ctx.bestScore) {
      ctx.best = candidate;
      ctx.bestScore = candidate.score;
    }
  });

const selectFallback = operation<Ctx, SchedulingDeps>('Keep fallback schedule')
  .reads('fallback')
  .writes('best', 'usedFallback')
  .handler((ctx) => {
    ctx.best = ctx.fallback;
    ctx.usedFallback = true;
  });

const hasUsableSchedule = guard<Ctx, SchedulingDeps>('Has usable schedule')
  .check((ctx) => Boolean(ctx.best))
  .denyWith(() => {
    throw new FlowHttpError({
      statusCode: 409,
      code: 'NO_SCHEDULE_FOUND',
      message: 'No usable schedule could be generated',
    });
  });

const exportSchedule = operation<Ctx, SchedulingDeps>('Export schedule')
  .dependsOn('scheduleService')
  .reads('best')
  .writes('scheduleId')
  .handler(async (ctx, deps) => {
    const { id } = await deps.scheduleService.export(ctx.best!);
    ctx.scheduleId = id;
  });

const serializeResponse = operation<Ctx, SchedulingDeps>('Serialize response')
  .writes('response')
  .handler((ctx) => {
    const response: ScheduleResponse = {
      scheduleId: ctx.scheduleId!,
      score: ctx.best!.score,
      attempts: ctx.attempts,
      usedFallback: ctx.usedFallback,
      load: ctx.best!.load,
    };
    return { response };
  });

const writeFailureAudit = operation<Ctx, SchedulingDeps>('Write failure audit log')
  .dependsOn('auditService')
  .handler(async (ctx, deps) => {
    await deps.auditService.record('schedule_generation_failed', {
      attempts: ctx.attempts,
    });
  });

/** Build the schedule-generation flow bound to concrete services. */
export function buildGenerateScheduleFlow(
  deps: SchedulingDeps,
): ExecutableFlow<Ctx, ScheduleResponse, SchedulingDeps> {
  return flow<Ctx, ScheduleResponse, SchedulingDeps>('Generate weekly schedule')
    .version('1.0.0')
    .metadata({ owner: 'scheduling', criticality: 'high' })
    .stage('Validate')
    .guard(hasEmployees)

    .stage('Search best schedule')
    .repeat('Generate candidate schedules', (r) =>
      r
        .maxAttempts(200)
        .timeBudgetMs(2000)
        .stopWhen('perfect balance reached', (ctx) => ctx.bestScore === 0)
        .do(resetGenerationState)
        .do(
          operation<Ctx, SchedulingDeps>('Count attempt')
            .writes('attempts')
            .handler((ctx) => ({
              attempts: ctx.attempts + 1,
            })),
        )
        .do(buildCandidateSchedule)
        .branch('Candidate result', (b) =>
          b
            .when('candidate failed', (ctx) => !ctx.candidate)
            .stopRepeat()
            .when('candidate should be skipped', (ctx) => !ctx.candidate!.valid)
            .continueRepeat()
            .otherwise()
            .do(scoreAndKeepBest),
        ),
    )

    .stage('Select result')
    .branch('Pick schedule', (b) =>
      b
        .when('best schedule found', (ctx) => Boolean(ctx.best))
        .goTo('Export')
        .otherwise()
        .goTo('Fallback'),
    )

    .stage('Fallback')
    .do(selectFallback)
    .guard(hasUsableSchedule)
    .goTo('Export')

    .stage('Export')
    .do(exportSchedule)
    .do(serializeResponse)

    .onFailure()
    .do(writeFailureAudit)

    .output((ctx) => ctx.response!)
    .withDependencies(deps);
}

export type { Ctx as GenerateScheduleContext };
