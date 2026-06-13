import type { BranchAction, FlowDefinition, Step } from '../types.js';

/** Render a human-readable, indented operation map of a flow. */
export function describeFlow(definition: FlowDefinition): string {
  const lines: string[] = [];
  const title = definition.version
    ? `${definition.name} (v${definition.version})`
    : definition.name;
  lines.push(title);

  for (const stage of definition.stages) {
    lines.push('');
    lines.push(stage.name);
    for (const step of stage.steps) {
      describeStep(step, 1, lines);
    }
  }

  if (definition.onFailure.length > 0) {
    lines.push('');
    lines.push('On failure');
    for (const op of definition.onFailure) {
      lines.push(`${indent(1)}- ${op.name}`);
    }
  }

  if (definition.finally.length > 0) {
    lines.push('');
    lines.push('Finally');
    for (const op of definition.finally) {
      lines.push(`${indent(1)}- ${op.name}`);
    }
  }

  return lines.join('\n');
}

function describeStep(step: Step, depth: number, lines: string[]): void {
  const pad = indent(depth);
  switch (step.kind) {
    case 'operation':
      lines.push(`${pad}- ${step.operation.name}`);
      break;
    case 'guard':
      lines.push(`${pad}- Guard: ${step.guard.name}`);
      break;
    case 'goto':
      lines.push(`${pad}- Go to: ${step.stageName}`);
      break;
    case 'fail':
      lines.push(
        `${pad}- Fail${step.error.code ? `: ${step.error.code}` : ''}`,
      );
      break;
    case 'subflow':
      lines.push(`${pad}- Subflow: ${step.subflow.name}`);
      break;
    case 'parallel':
      lines.push(`${pad}- Parallel: ${step.parallel.name}`);
      for (const op of step.parallel.operations) {
        lines.push(`${indent(depth + 1)}- ${op.name}`);
      }
      break;
    case 'branch':
      lines.push(`${pad}- Branch: ${step.branch.name}`);
      for (const c of step.branch.cases) {
        const label = c.predicate === undefined ? 'Otherwise' : c.name;
        lines.push(`${indent(depth + 1)}- ${label} ${actionLabel(c.action)}`);
      }
      break;
    case 'repeat':
      lines.push(`${pad}- Repeat: ${step.repeat.name}`);
      if (step.repeat.maxAttempts !== undefined) {
        lines.push(`${indent(depth + 1)}- Max attempts: ${step.repeat.maxAttempts}`);
      }
      if (step.repeat.timeBudgetMs !== undefined) {
        lines.push(`${indent(depth + 1)}- Time budget: ${step.repeat.timeBudgetMs}ms`);
      }
      for (const cond of step.repeat.stopConditions) {
        lines.push(`${indent(depth + 1)}- Stop when: ${cond.name}`);
      }
      for (const child of step.repeat.body) {
        describeStep(child, depth + 1, lines);
      }
      break;
    default:
      break;
  }
}

function actionLabel(action: BranchAction): string {
  switch (action.kind) {
    case 'goto':
      return `-> ${action.stageName}`;
    case 'do':
      return `-> do ${action.operation.name}`;
    case 'continueRepeat':
      return '-> continue repeat';
    case 'stopRepeat':
      return '-> stop repeat';
    case 'fail':
      return '-> fail';
    default:
      return '';
  }
}

function indent(depth: number): string {
  return '  '.repeat(depth);
}
