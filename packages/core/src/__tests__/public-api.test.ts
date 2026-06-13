import { describe, expect, it } from 'vitest';
import * as api from '../index.js';
import * as testingApi from '../testing/index.js';

/**
 * Locks the public API surface. Adding an export is fine (update this list);
 * removing/renaming one is a breaking change and should fail here first.
 */
const EXPECTED_ROOT_EXPORTS = [
  'flow',
  'FlowBuilder',
  'operation',
  'guard',
  'BranchBuilder',
  'ParallelBuilder',
  'RepeatBuilder',
  'runFlow',
  'createExecutableFlow',
  'FlowRegistry',
  'validateFlow',
  'buildGraph',
  'renderMermaid',
  'describeFlow',
  'FlowError',
  'FlowHttpError',
  'FlowValidationError',
  'FlowTimeoutError',
  'FlowCancelledError',
  'serializeError',
].sort();

const EXPECTED_TESTING_EXPORTS = [
  'hasRun',
  'hasCompleted',
  'hasFailedAt',
  'hasSelectedBranch',
  'hasRunCompensation',
  'hasRunFinally',
  'pathlineMatchers',
].sort();

describe('public API surface', () => {
  it('exports exactly the expected runtime values from the root', () => {
    const actual = Object.keys(api)
      .filter((k) => api[k as keyof typeof api] !== undefined)
      .sort();
    expect(actual).toEqual(EXPECTED_ROOT_EXPORTS);
  });

  it('exports exactly the expected helpers from /testing', () => {
    const actual = Object.keys(testingApi).sort();
    expect(actual).toEqual(EXPECTED_TESTING_EXPORTS);
  });
});
