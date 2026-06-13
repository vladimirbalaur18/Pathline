/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FlowTraceEvent } from '../types.js';
import {
  hasCompleted,
  hasFailedAt,
  hasRun,
  hasRunCompensation,
  hasSelectedBranch,
} from './helpers.js';

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

/**
 * Optional Vitest/Jest-compatible custom matchers over a trace array.
 *
 * **What:** ergonomic wrappers around the {@link hasRun}/{@link hasCompleted}/
 * etc. helpers - `toHaveRun`, `toHaveCompleted`, `toHaveFailedAt`,
 * `toHaveSelectedBranch`, `toHaveRunCompensation`.
 *
 * **When to use:** when you want fluent assertions like
 * `expect(result.trace).toHaveRun('Run agent')` with nicer failure messages.
 *
 * **Why:** optional sugar - the plain helper functions work everywhere; register
 * these only if your runner supports `expect.extend`.
 *
 * @example
 * import { expect } from 'vitest';
 * import { pathlineMatchers } from '@pathline/core/testing';
 * expect.extend(pathlineMatchers);
 * expect(result.trace).toHaveFailedAt('Plan includes AI agent runs');
 */
export const pathlineMatchers = {
  toHaveRun(trace: FlowTraceEvent[], name: string): MatcherResult {
    const pass = hasRun(trace, name);
    return {
      pass,
      message: () =>
        pass
          ? `expected trace not to have run "${name}"`
          : `expected trace to have run "${name}"`,
    };
  },
  toHaveCompleted(trace: FlowTraceEvent[], name: string): MatcherResult {
    const pass = hasCompleted(trace, name);
    return {
      pass,
      message: () =>
        pass
          ? `expected trace not to have completed "${name}"`
          : `expected trace to have completed "${name}"`,
    };
  },
  toHaveFailedAt(trace: FlowTraceEvent[], name: string): MatcherResult {
    const pass = hasFailedAt(trace, name);
    return {
      pass,
      message: () =>
        pass
          ? `expected trace not to have failed at "${name}"`
          : `expected trace to have failed at "${name}"`,
    };
  },
  toHaveSelectedBranch(
    trace: FlowTraceEvent[],
    branchName: string,
    caseName: string,
  ): MatcherResult {
    const pass = hasSelectedBranch(trace, branchName, caseName);
    return {
      pass,
      message: () =>
        pass
          ? `expected branch "${branchName}" not to select "${caseName}"`
          : `expected branch "${branchName}" to select "${caseName}"`,
    };
  },
  toHaveRunCompensation(trace: FlowTraceEvent[], name: string): MatcherResult {
    const pass = hasRunCompensation(trace, name);
    return {
      pass,
      message: () =>
        pass
          ? `expected trace not to have run compensation "${name}"`
          : `expected trace to have run compensation "${name}"`,
    };
  },
};
