export interface ScheduleInput {
  employees: string[];
  days: number;
  shiftsPerDay: number;
  seed: number;
}

export interface Candidate {
  /** day index -> employee names assigned that day */
  assignments: string[][];
  /** count of shifts per employee */
  load: Record<string, number>;
  /** lower is better; 0 = perfectly balanced */
  score: number;
  valid: boolean;
}

export interface ScheduleResponse {
  scheduleId: string;
  score: number;
  attempts: number;
  usedFallback: boolean;
  load: Record<string, number>;
}

export interface SchedulingDeps {
  scheduleService: {
    export: (candidate: Candidate) => Promise<{ id: string }>;
  };
  auditService: {
    record: (message: string, meta?: unknown) => Promise<void>;
  };
}

export interface SchedulingContext {
  input: ScheduleInput;
  candidate?: Candidate;
  best?: Candidate;
  bestScore: number;
  attempts: number;
  usedFallback: boolean;
  scheduleId?: string;
  response?: ScheduleResponse;
}
