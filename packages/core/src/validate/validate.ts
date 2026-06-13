/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  FlowDefinition,
  FlowValidationIssue,
  FlowValidationResult,
  StageDefinition,
  Step,
} from '../types.js';

export interface ValidateOptions {
  strict?: boolean;
}

/** Validate the structural integrity of a flow definition. */
export function validateFlow(
  definition: FlowDefinition,
  options: ValidateOptions = {},
): FlowValidationResult {
  const errors: FlowValidationIssue[] = [];
  const warnings: FlowValidationIssue[] = [];
  const strict = options.strict ?? false;

  const stageNames = new Set<string>();
  const stageNameList: string[] = [];

  if (definition.stages.length === 0) {
    errors.push({ code: 'EMPTY_FLOW', message: 'Flow has no stages', severity: 'error' });
  }

  if (!definition.output) {
    errors.push({
      code: 'MISSING_OUTPUT',
      message: 'Flow has no output() resolver',
      severity: 'error',
    });
  }

  for (const stage of definition.stages) {
    stageNameList.push(stage.name);
    if (stageNames.has(stage.name)) {
      errors.push({
        code: 'DUPLICATE_STAGE_NAME',
        message: `Duplicate stage name "${stage.name}"`,
        path: [stage.name],
        severity: 'error',
      });
    }
    stageNames.add(stage.name);

    if (stage.steps.length === 0) {
      errors.push({
        code: 'EMPTY_STAGE',
        message: `Stage "${stage.name}" has no steps`,
        path: [stage.name],
        severity: 'error',
      });
    }

    validateStageOperationNames(stage, errors);
  }

  for (const stage of definition.stages) {
    for (const step of stage.steps) {
      validateStep(step, { stageName: stage.name, insideRepeat: false }, {
        stageNames,
        errors,
        warnings,
        strict,
      });
    }
  }

  detectUnreachableStages(definition, warnings);

  const ok =
    errors.length === 0 && (!strict || warnings.length === 0);
  return { ok, errors, warnings };
}

function validateStageOperationNames(
  stage: StageDefinition,
  errors: FlowValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const step of stage.steps) {
    if (step.kind === 'operation') {
      const name = step.operation.name;
      if (seen.has(name)) {
        errors.push({
          code: 'DUPLICATE_OPERATION_NAME',
          message: `Duplicate operation name "${name}" in stage "${stage.name}"`,
          path: [stage.name, name],
          severity: 'error',
        });
      }
      seen.add(name);
    }
  }
}

interface WalkContext {
  stageName: string;
  insideRepeat: boolean;
}

interface WalkDeps {
  stageNames: Set<string>;
  errors: FlowValidationIssue[];
  warnings: FlowValidationIssue[];
  strict: boolean;
}

function validateStep(step: Step, ctx: WalkContext, deps: WalkDeps): void {
  const { errors, warnings, stageNames, strict } = deps;

  switch (step.kind) {
    case 'goto':
      if (!stageNames.has(step.stageName)) {
        errors.push({
          code: 'GOTO_TARGET_MISSING',
          message: `goTo target stage "${step.stageName}" does not exist (in "${ctx.stageName}")`,
          path: [ctx.stageName],
          severity: 'error',
        });
      }
      break;

    case 'branch': {
      if (step.branch.cases.length === 0) {
        errors.push({
          code: 'BRANCH_NO_CASES',
          message: `Branch "${step.branch.name}" has no cases`,
          path: [ctx.stageName, step.branch.name],
          severity: 'error',
        });
      }
      const hasOtherwise = step.branch.cases.some((c) => c.predicate === undefined);
      if (!hasOtherwise && strict) {
        errors.push({
          code: 'BRANCH_NO_OTHERWISE',
          message: `Branch "${step.branch.name}" has no otherwise() (strict mode)`,
          path: [ctx.stageName, step.branch.name],
          severity: 'error',
        });
      }
      for (const c of step.branch.cases) {
        if (c.action.kind === 'goto' && !stageNames.has(c.action.stageName)) {
          errors.push({
            code: 'GOTO_TARGET_MISSING',
            message: `Branch "${step.branch.name}" case "${c.name}" goes to missing stage "${c.action.stageName}"`,
            path: [ctx.stageName, step.branch.name, c.name],
            severity: 'error',
          });
        }
        if (
          (c.action.kind === 'continueRepeat' || c.action.kind === 'stopRepeat') &&
          !ctx.insideRepeat
        ) {
          errors.push({
            code: 'REPEAT_SIGNAL_OUTSIDE_REPEAT',
            message: `Branch "${step.branch.name}" case "${c.name}" uses ${c.action.kind} outside a repeat()`,
            path: [ctx.stageName, step.branch.name, c.name],
            severity: 'error',
          });
        }
      }
      break;
    }

    case 'parallel': {
      if (step.parallel.operations.length === 0) {
        errors.push({
          code: 'PARALLEL_EMPTY',
          message: `Parallel section "${step.parallel.name}" has no operations`,
          path: [ctx.stageName, step.parallel.name],
          severity: 'error',
        });
      }
      detectParallelWriteConflicts(step, ctx, deps);
      break;
    }

    case 'repeat': {
      if (step.repeat.body.length === 0) {
        errors.push({
          code: 'REPEAT_EMPTY',
          message: `Repeat section "${step.repeat.name}" has no body`,
          path: [ctx.stageName, step.repeat.name],
          severity: 'error',
        });
      }
      if (
        step.repeat.maxAttempts === undefined &&
        step.repeat.timeBudgetMs === undefined
      ) {
        errors.push({
          code: 'REPEAT_UNBOUNDED',
          message: `Repeat section "${step.repeat.name}" has neither maxAttempts nor timeBudgetMs`,
          path: [ctx.stageName, step.repeat.name],
          severity: 'error',
        });
      }
      for (const child of step.repeat.body) {
        validateStep(
          child,
          { stageName: ctx.stageName, insideRepeat: true },
          deps,
        );
      }
      break;
    }

    default:
      break;
  }

  // continueRepeat/stopRepeat are only reachable via branch actions, handled above.
  void warnings;
}

function detectParallelWriteConflicts(
  step: Extract<Step, { kind: 'parallel' }>,
  ctx: WalkContext,
  deps: WalkDeps,
): void {
  const writers = new Map<string, string[]>();
  for (const op of step.parallel.operations) {
    for (const path of op.writes) {
      const list = writers.get(path) ?? [];
      list.push(op.name);
      writers.set(path, list);
    }
  }
  for (const [path, ops] of writers) {
    if (ops.length > 1) {
      const issue: FlowValidationIssue = {
        code: 'PARALLEL_WRITE_CONFLICT',
        message: `Parallel "${step.parallel.name}" has multiple operations writing "${path}": ${ops.join(', ')}`,
        path: [ctx.stageName, step.parallel.name, path],
        severity: deps.strict ? 'error' : 'warning',
      };
      if (deps.strict) deps.errors.push(issue);
      else deps.warnings.push(issue);
    }
  }
}

function detectUnreachableStages(
  definition: FlowDefinition,
  warnings: FlowValidationIssue[],
): void {
  const stages = definition.stages;
  if (stages.length === 0) return;

  const indexByName = new Map<string, number>();
  stages.forEach((s, i) => indexByName.set(s.name, i));

  const reachable = new Set<number>();
  const queue: number[] = [0];

  while (queue.length > 0) {
    const i = queue.shift()!;
    if (reachable.has(i)) continue;
    reachable.add(i);
    const stage = stages[i]!;

    for (const target of collectGotoTargets(stage.steps)) {
      const idx = indexByName.get(target);
      if (idx !== undefined && !reachable.has(idx)) queue.push(idx);
    }

    if (fallsThrough(stage) && i + 1 < stages.length && !reachable.has(i + 1)) {
      queue.push(i + 1);
    }
  }

  stages.forEach((stage, i) => {
    if (!reachable.has(i)) {
      warnings.push({
        code: 'UNREACHABLE_STAGE',
        message: `Stage "${stage.name}" is unreachable`,
        path: [stage.name],
        severity: 'warning',
      });
    }
  });
}

function collectGotoTargets(steps: Step[]): string[] {
  const targets: string[] = [];
  for (const step of steps) {
    if (step.kind === 'goto') targets.push(step.stageName);
    else if (step.kind === 'branch') {
      for (const c of step.branch.cases) {
        if (c.action.kind === 'goto') targets.push(c.action.stageName);
      }
    } else if (step.kind === 'repeat') {
      targets.push(...collectGotoTargets(step.repeat.body));
    }
  }
  return targets;
}

function fallsThrough(stage: StageDefinition): boolean {
  const last = stage.steps[stage.steps.length - 1];
  if (!last) return true;
  return last.kind !== 'goto' && last.kind !== 'fail';
}
