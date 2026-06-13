/* eslint-disable @typescript-eslint/no-explicit-any */
import { slugify } from '../internal/ids.js';
import type {
  FlowDefinition,
  FlowGraph,
  FlowGraphEdge,
  FlowGraphNode,
  StageDefinition,
  Step,
} from '../types.js';

/** Build a domain-neutral graph model from a flow definition. */
export function buildGraph(definition: FlowDefinition): FlowGraph {
  const nodes: FlowGraphNode[] = [];
  const edges: FlowGraphEdge[] = [];

  const flowId = `flow:${slugify(definition.name)}`;
  nodes.push({ id: flowId, label: definition.name, kind: 'flow' });

  const stages = definition.stages;
  const stageId = (s: StageDefinition): string => `stage:${s.id}`;
  const stageIdByName = new Map<string, string>();
  for (const stage of stages) stageIdByName.set(stage.name, stageId(stage));

  stages.forEach((stage, index) => {
    nodes.push({ id: stageId(stage), label: stage.name, kind: 'stage' });

    if (index === 0) {
      edges.push({ from: flowId, to: stageId(stage) });
    }

    for (const step of stage.steps) {
      addStepNodes(step, stage, stageId(stage), stageIdByName, nodes, edges);
    }

    if (fallsThrough(stage) && index + 1 < stages.length) {
      edges.push({ from: stageId(stage), to: stageId(stages[index + 1]!) });
    }
  });

  if (definition.onFailure.length > 0) {
    const failureId = 'failure:onFailure';
    nodes.push({ id: failureId, label: 'On failure', kind: 'failure' });
    edges.push({ from: flowId, to: failureId, label: 'on failure' });
    definition.onFailure.forEach((op) => {
      const id = `compensation:${op.id}`;
      nodes.push({ id, label: op.name, kind: 'compensation' });
      edges.push({ from: failureId, to: id });
    });
  }

  if (definition.finally.length > 0) {
    const finallyId = 'finally:finally';
    nodes.push({ id: finallyId, label: 'Finally', kind: 'finally' });
    edges.push({ from: flowId, to: finallyId, label: 'finally' });
    definition.finally.forEach((op) => {
      const id = `finally:${op.id}`;
      nodes.push({ id, label: op.name, kind: 'finally' });
      edges.push({ from: finallyId, to: id });
    });
  }

  if (definition.output) {
    const outputId = 'output:output';
    nodes.push({ id: outputId, label: 'Output', kind: 'output' });
    const lastStage = stages[stages.length - 1];
    if (lastStage) edges.push({ from: stageId(lastStage), to: outputId });
  }

  return { id: flowId, name: definition.name, nodes, edges };
}

function addStepNodes(
  step: Step,
  stage: StageDefinition,
  fromStageId: string,
  stageIdByName: Map<string, string>,
  nodes: FlowGraphNode[],
  edges: FlowGraphEdge[],
): void {
  switch (step.kind) {
    case 'branch': {
      const branchId = `branch:${stage.id}:${step.branch.id}`;
      nodes.push({ id: branchId, label: step.branch.name, kind: 'branch' });
      edges.push({ from: fromStageId, to: branchId });
      for (const c of step.branch.cases) {
        if (c.action.kind === 'goto') {
          const target = stageIdByName.get(c.action.stageName);
          if (target) edges.push({ from: branchId, to: target, label: c.name });
        }
      }
      break;
    }
    case 'repeat': {
      const repeatId = `repeat:${stage.id}:${step.repeat.id}`;
      nodes.push({
        id: repeatId,
        label: step.repeat.name,
        kind: 'repeat',
        metadata: {
          maxAttempts: step.repeat.maxAttempts,
          timeBudgetMs: step.repeat.timeBudgetMs,
        },
      });
      edges.push({ from: fromStageId, to: repeatId });
      for (const child of step.repeat.body) {
        addStepNodes(child, stage, repeatId, stageIdByName, nodes, edges);
      }
      break;
    }
    case 'parallel': {
      const parallelId = `parallel:${stage.id}:${step.parallel.id}`;
      nodes.push({
        id: parallelId,
        label: step.parallel.name,
        kind: 'parallel',
        metadata: { mode: step.parallel.mode },
      });
      edges.push({ from: fromStageId, to: parallelId });
      break;
    }
    case 'goto': {
      const target = stageIdByName.get(step.stageName);
      if (target) edges.push({ from: fromStageId, to: target });
      break;
    }
    case 'subflow': {
      const subflowId = `subflow:${stage.id}:${step.subflow.id}`;
      nodes.push({ id: subflowId, label: step.subflow.name, kind: 'subflow' });
      edges.push({ from: fromStageId, to: subflowId });
      break;
    }
    default:
      break;
  }
}

function fallsThrough(stage: StageDefinition): boolean {
  const last = stage.steps[stage.steps.length - 1];
  if (!last) return true;
  return last.kind !== 'goto' && last.kind !== 'fail';
}
