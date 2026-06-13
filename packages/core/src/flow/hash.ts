/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashString } from '../internal/ids.js';
import type { FlowDefinition, Step } from '../types.js';

/**
 * Compute a stable hash of the SERIALIZABLE flow structure only: ids, names,
 * stage order, step kinds, branch labels/actions, metadata/tags, and version.
 * Never includes function source/closures, deps, or runtime options.
 */
export function computeDefinitionHash(definition: FlowDefinition): string {
  const skeleton = {
    name: definition.name,
    version: definition.version ?? null,
    metadata: definition.metadata ?? null,
    tags: definition.tags,
    stages: definition.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      metadata: stage.metadata ?? null,
      tags: stage.tags,
      steps: stage.steps.map(stepSkeleton),
    })),
    onFailure: definition.onFailure.map((op) => op.id),
    finally: definition.finally.map((op) => op.id),
    hasOutput: Boolean(definition.output),
  };
  return hashString(JSON.stringify(skeleton));
}

function stepSkeleton(step: Step): unknown {
  switch (step.kind) {
    case 'operation':
      return {
        kind: step.kind,
        id: step.operation.id,
        name: step.operation.name,
        reads: step.operation.reads,
        writes: step.operation.writes,
        dependsOn: step.operation.dependsOn,
        tags: step.operation.tags,
      };
    case 'guard':
      return { kind: step.kind, id: step.guard.id, name: step.guard.name };
    case 'branch':
      return {
        kind: step.kind,
        id: step.branch.id,
        name: step.branch.name,
        cases: step.branch.cases.map((c) => ({
          name: c.name,
          otherwise: c.predicate === undefined,
          action:
            c.action.kind === 'goto'
              ? { kind: c.action.kind, stageName: c.action.stageName }
              : c.action.kind === 'do'
                ? { kind: c.action.kind, operation: c.action.operation.id }
                : c.action.kind === 'fail'
                  ? { kind: c.action.kind, code: c.action.error.code ?? null }
                  : { kind: c.action.kind },
        })),
      };
    case 'parallel':
      return {
        kind: step.kind,
        id: step.parallel.id,
        name: step.parallel.name,
        mode: step.parallel.mode,
        concurrency: step.parallel.concurrency ?? null,
        operations: step.parallel.operations.map((op) => op.id),
      };
    case 'repeat':
      return {
        kind: step.kind,
        id: step.repeat.id,
        name: step.repeat.name,
        maxAttempts: step.repeat.maxAttempts ?? null,
        timeBudgetMs: step.repeat.timeBudgetMs ?? null,
        stopConditions: step.repeat.stopConditions.map((s) => s.name),
        body: step.repeat.body.map(stepSkeleton),
      };
    case 'goto':
      return { kind: step.kind, stageName: step.stageName };
    case 'fail':
      return { kind: step.kind, code: step.error.code ?? null };
    case 'subflow':
      return { kind: step.kind, id: step.subflow.id, name: step.subflow.name };
    default:
      return { kind: 'unknown' };
  }
}
