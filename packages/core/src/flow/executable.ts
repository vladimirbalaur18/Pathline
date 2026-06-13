/* eslint-disable @typescript-eslint/no-explicit-any */
import { FlowError } from '../errors/index.js';
import { computeDefinitionHash } from './hash.js';
import { collectDependencies } from './deps.js';
import { runFlow } from '../runtime/runner.js';
import { validateFlow } from '../validate/validate.js';
import { buildGraph } from '../graph/graph-builder.js';
import { renderMermaid } from '../graph/mermaid-renderer.js';
import { describeFlow } from '../graph/describe-renderer.js';
import type {
  ExecutableFlow,
  FlowDefinition,
  FlowGraph,
  FlowRunOptions,
  FlowRunResult,
  FlowValidationResult,
} from '../types.js';

/** Build an ExecutableFlow from a finished FlowDefinition. */
export function createExecutableFlow<TContext, TOutput, TDeps>(
  definition: FlowDefinition<TContext, TOutput, TDeps>,
  boundDeps?: TDeps,
): ExecutableFlow<TContext, TOutput, TDeps> {
  let hash: string | undefined;
  const getHash = (): string => {
    if (hash === undefined) hash = computeDefinitionHash(definition);
    return hash;
  };

  return {
    name: definition.name,
    version: definition.version,
    definition,

    async run(
      initialContext: Partial<TContext>,
      options?: FlowRunOptions<TContext>,
    ): Promise<FlowRunResult<TOutput>> {
      return runFlow(
        definition,
        initialContext,
        boundDeps as TDeps,
        { definitionHash: getHash() },
        options,
      );
    },

    withDependencies(deps: TDeps): ExecutableFlow<TContext, TOutput, TDeps> {
      assertDependenciesSatisfied(definition, deps);
      return createExecutableFlow(definition, deps);
    },

    describe(): string {
      return describeFlow(definition as FlowDefinition);
    },

    toGraph(): FlowGraph {
      return buildGraph(definition as FlowDefinition);
    },

    toMermaid(): string {
      return renderMermaid(buildGraph(definition as FlowDefinition));
    },

    validate(options?: { strict?: boolean }): FlowValidationResult {
      return validateFlow(definition as FlowDefinition, options);
    },

    definitionHash(): string {
      return getHash();
    },
  };
}

function assertDependenciesSatisfied(
  definition: FlowDefinition,
  deps: unknown,
): void {
  const required = collectDependencies(definition);
  if (required.size === 0) return;
  const provided =
    deps && typeof deps === 'object' ? new Set(Object.keys(deps)) : new Set<string>();

  for (const { dep, operation } of required.values()) {
    if (!provided.has(dep)) {
      throw new FlowError({
        message: `MISSING_FLOW_DEPENDENCY: Operation "${operation}" requires dependency "${dep}"`,
        code: 'MISSING_FLOW_DEPENDENCY',
        details: { dependency: dep, operation },
      });
    }
  }
}
