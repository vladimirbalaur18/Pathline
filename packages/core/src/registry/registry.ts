/* eslint-disable @typescript-eslint/no-explicit-any */
import { FlowValidationError } from '../errors/index.js';
import type {
  ExecutableFlow,
  FlowValidationIssue,
  FlowValidationResult,
} from '../types.js';

/** Aggregate result of {@link FlowRegistry.validateAll}. */
export interface RegistryValidationResult {
  /** `true` if every registered flow validated (warnings only count in strict). */
  ok: boolean;
  /** Per-flow validation results, keyed by flow name. */
  byFlow: Record<string, FlowValidationResult>;
}

/**
 * A collection of flows that can be validated together at application startup.
 *
 * **What:** register your flows once, then `validateAll()` during boot.
 *
 * **When to use:** in apps with several flows (especially with the NestJS
 * `validateOnBootstrap` option) to catch structural mistakes before serving
 * traffic.
 *
 * **Why:** fail fast - discover a broken `goTo` target or unbounded `repeat` at
 * boot instead of mid-request. Also enforces unique flow names.
 */
export class FlowRegistry {
  private readonly flows = new Map<string, ExecutableFlow<any, any, any>>();

  /**
   * Add a flow to the registry (keyed by its name).
   *
   * **Why:** names act as stable keys for lookup and validation; registering two
   * flows with the same name throws `DUPLICATE_FLOW_NAME` to prevent ambiguity.
   *
   * @throws {FlowValidationError} if a flow with the same name already exists.
   */
  register(flow: ExecutableFlow<any, any, any>): this {
    if (this.flows.has(flow.name)) {
      throw new FlowValidationError(
        `A flow named "${flow.name}" is already registered`,
        [
          {
            code: 'DUPLICATE_FLOW_NAME',
            message: `Duplicate flow name "${flow.name}"`,
            severity: 'error',
          },
        ],
      );
    }
    this.flows.set(flow.name, flow);
    return this;
  }

  /**
   * Look up a registered flow by name.
   *
   * **When to use:** for name-based dispatch (e.g. running a flow chosen at
   * runtime) or in tooling/devtools.
   */
  get(name: string): ExecutableFlow<any, any, any> | undefined {
    return this.flows.get(name);
  }

  /**
   * List all registered flows.
   *
   * **When to use:** to enumerate flows for dashboards, docs generation, or
   * bulk operations.
   */
  list(): ExecutableFlow<any, any, any>[] {
    return [...this.flows.values()];
  }

  /**
   * Validate every registered flow at once.
   *
   * **When to use:** at application startup to fail fast on structural problems.
   *
   * **Why:** aggregates per-flow results; with `{ strict: true }` it treats
   * warnings as failures and throws {@link FlowValidationError} so a bad deploy
   * stops at boot.
   *
   * @throws {FlowValidationError} when `options.strict` is set and any flow has
   *   errors or warnings.
   */
  validateAll(options?: { strict?: boolean }): RegistryValidationResult {
    const byFlow: Record<string, FlowValidationResult> = {};
    const allIssues: FlowValidationIssue[] = [];
    let ok = true;

    for (const flow of this.flows.values()) {
      const result = flow.validate(options);
      byFlow[flow.name] = result;
      if (!result.ok) {
        ok = false;
        allIssues.push(
          ...result.errors.map((i) => ({ ...i, path: [flow.name, ...(i.path ?? [])] })),
        );
        if (options?.strict) {
          allIssues.push(
            ...result.warnings.map((i) => ({
              ...i,
              path: [flow.name, ...(i.path ?? [])],
            })),
          );
        }
      }
    }

    if (!ok && options?.strict) {
      throw new FlowValidationError('Flow registry validation failed', allIssues);
    }

    return { ok, byFlow };
  }
}
