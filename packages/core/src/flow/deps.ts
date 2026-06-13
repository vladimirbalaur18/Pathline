/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FlowDefinition, OperationDefinition, Step } from '../types.js';

export interface RequiredDependency {
  dep: string;
  operation: string;
}

/** Collect every declared dependency across all operations in a flow. */
export function collectDependencies(
  definition: FlowDefinition,
): Map<string, RequiredDependency> {
  const required = new Map<string, RequiredDependency>();

  const addOp = (op: OperationDefinition): void => {
    for (const dep of op.dependsOn) {
      const key = `${dep}::${op.name}`;
      if (!required.has(key)) required.set(key, { dep, operation: op.name });
    }
  };

  const walk = (steps: Step[]): void => {
    for (const step of steps) {
      switch (step.kind) {
        case 'operation':
          addOp(step.operation);
          break;
        case 'guard':
          for (const dep of step.guard.dependsOn) {
            const key = `${dep}::${step.guard.name}`;
            if (!required.has(key)) {
              required.set(key, { dep, operation: step.guard.name });
            }
          }
          break;
        case 'parallel':
          step.parallel.operations.forEach(addOp);
          break;
        case 'branch':
          for (const c of step.branch.cases) {
            if (c.action.kind === 'do') addOp(c.action.operation);
          }
          break;
        case 'repeat':
          walk(step.repeat.body);
          break;
        default:
          break;
      }
    }
  };

  for (const stage of definition.stages) walk(stage.steps);
  definition.onFailure.forEach(addOp);
  definition.finally.forEach(addOp);

  return required;
}
