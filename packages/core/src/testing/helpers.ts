import type { FlowTraceEvent } from '../types.js';

const matchesName = (e: FlowTraceEvent, name: string): boolean =>
  e.operationName === name || e.message === name;

/**
 * Assert that an operation/guard with the given name ran during the flow.
 *
 * **When to use:** in full-flow tests to confirm a step executed (or, with
 * `expect(...).toBe(false)`, that a step was skipped on a given path).
 *
 * **Why:** runner-agnostic (works with Jest or Vitest); checks the trace rather
 * than internal state, so tests stay decoupled from implementation.
 */
export function hasRun(trace: FlowTraceEvent[], name: string): boolean {
  return trace.some((e) => matchesName(e, name) && e.status !== 'skipped');
}

/**
 * Assert that an operation/guard with the given name completed successfully.
 *
 * **When to use:** when "it ran" is not enough and you need "it finished ok".
 *
 * **Why:** distinguishes a successful completion from a started-but-failed step.
 */
export function hasCompleted(trace: FlowTraceEvent[], name: string): boolean {
  return trace.some((e) => matchesName(e, name) && e.status === 'completed');
}

/**
 * Assert that the run failed at the operation/guard with the given name.
 *
 * **When to use:** to pin a failure to a specific business step (e.g. a guard
 * denying), making failure tests precise.
 *
 * **Why:** asserts on the named step rather than a stack trace.
 */
export function hasFailedAt(trace: FlowTraceEvent[], name: string): boolean {
  return trace.some((e) => matchesName(e, name) && e.status === 'failed');
}

/**
 * Assert that the named branch selected the given case.
 *
 * **When to use:** to verify routing decisions (e.g. quota branch chose
 * "Overage allowed").
 *
 * **Why:** the selected case is recorded in the trace, so you can test the
 * decision, not just the downstream effects.
 */
export function hasSelectedBranch(
  trace: FlowTraceEvent[],
  branchName: string,
  caseName: string,
): boolean {
  return trace.some(
    (e) =>
      e.kind === 'branch' &&
      e.status === 'selected' &&
      e.message === branchName &&
      e.selectedBranch === caseName,
  );
}

/**
 * Assert that an `onFailure` compensation step with the given name ran.
 *
 * **When to use:** to verify cleanup/rollback happened after a failure (e.g.
 * "Release reserved usage" ran).
 *
 * **Why:** compensation is best-effort and easy to forget; this makes saga
 * behavior testable.
 */
export function hasRunCompensation(
  trace: FlowTraceEvent[],
  name: string,
): boolean {
  return trace.some((e) => e.kind === 'compensation' && matchesName(e, name));
}

/**
 * Assert that a `finally` cleanup step with the given name ran.
 *
 * **When to use:** to verify always-run cleanup executed on both success and
 * failure paths (e.g. "Release lock").
 *
 * **Why:** finally steps are easy to overlook; this confirms resources are
 * released regardless of outcome.
 */
export function hasRunFinally(trace: FlowTraceEvent[], name: string): boolean {
  return trace.some((e) => e.kind === 'finally' && matchesName(e, name));
}
