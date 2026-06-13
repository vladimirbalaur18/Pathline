import type { Candidate, SchedulingDeps } from './scheduling.types.js';

/** Deterministic PRNG (mulberry32) so candidate generation is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-memory fakes so the example runs without external infrastructure. */
export function createSchedulingDeps(): SchedulingDeps & { exported: Candidate[] } {
  const exported: Candidate[] = [];
  return {
    exported,
    scheduleService: {
      async export(candidate: Candidate) {
        exported.push(candidate);
        return { id: `sched_${exported.length}` };
      },
    },
    auditService: {
      async record() {
        /* no-op fake */
      },
    },
  };
}
