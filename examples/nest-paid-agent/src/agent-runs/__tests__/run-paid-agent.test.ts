import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { FlowHttpError } from '@pathline/core';
import { hasFailedAt, hasRun, hasRunCompensation } from '@pathline/core/testing';
import { FlowRunner } from '@pathline/nestjs';
import { buildRunPaidAgentFlow } from '../flows/run-paid-agent.flow.js';
import { createMockDeps } from '../services/index.js';
import { AgentRunsController } from '../agent-runs.controller.js';
import type { RunPaidAgentContext } from '../run-paid-agent.context.js';

const validBody = { prompt: 'Analyze this', model: 'fast', maxTokens: 1000 };

const runInput = (
  overrides: Partial<RunPaidAgentContext['input']> = {},
): Partial<RunPaidAgentContext> => ({
  input: {
    workspaceId: 'workspace-1',
    authorization: 'Bearer valid-token',
    body: validBody,
    ...overrides,
  },
});

describe('run-paid-agent flow', () => {
  it('validates cleanly', () => {
    const flow = buildRunPaidAgentFlow(createMockDeps());
    const result = flow.validate();
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('runs the agent on the happy path', async () => {
    const flow = buildRunPaidAgentFlow(createMockDeps());
    const result = await flow.run(runInput());
    expect(result.ok).toBe(true);
    expect(result.output?.agentRunId).toMatch(/^run_/);
    expect(result.output?.output).toContain('Analyze this');
    expect(hasRun(result.trace, 'Run agent')).toBe(true);
  });

  it('does not run agent when plan does not include the feature', async () => {
    const flow = buildRunPaidAgentFlow(
      createMockDeps({
        plan: { id: 'basic', features: [], monthlyAgentRuns: 0, allowsOverage: false },
      }),
    );
    const result = await flow.run(runInput());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('FEATURE_NOT_INCLUDED');
    expect(hasFailedAt(result.trace, 'Plan includes AI agent runs')).toBe(true);
    expect(hasRun(result.trace, 'Run agent')).toBe(false);
  });

  it('rejects when quota exceeded without overage and runs compensation', async () => {
    const flow = buildRunPaidAgentFlow(
      createMockDeps({
        plan: { id: 'pro', features: ['agent-runs'], monthlyAgentRuns: 10, allowsOverage: false },
        usage: { used: 10, limit: 10 },
      }),
    );
    const result = await flow.run(runInput());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('QUOTA_EXCEEDED');
    expect(hasRunCompensation(result.trace, 'Write failure audit log')).toBe(true);
  });

  it('takes the overage path when allowed', async () => {
    const flow = buildRunPaidAgentFlow(
      createMockDeps({
        plan: { id: 'pro', features: ['agent-runs'], monthlyAgentRuns: 10, allowsOverage: true },
        usage: { used: 10, limit: 10 },
      }),
    );
    const result = await flow.run(runInput());
    expect(result.ok).toBe(true);
    expect(result.output?.usedOverage).toBe(true);
    expect(hasRun(result.trace, 'Authorize overage charge')).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const flow = buildRunPaidAgentFlow(createMockDeps());
    const result = await flow.run(runInput({ authorization: 'Bearer wrong' }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('UNAUTHENTICATED');
  });
});

describe('AgentRunsController integration', () => {
  it('returns the flow output on success', async () => {
    const controller = new AgentRunsController(
      new FlowRunner({}),
      buildRunPaidAgentFlow(createMockDeps()),
    );
    const response = await controller.runAgent('workspace-1', validBody, 'Bearer valid-token');
    expect(response.output).toContain('Analyze this');
  });

  it('throws FlowHttpError mapped from a failed flow', async () => {
    const controller = new AgentRunsController(
      new FlowRunner({}),
      buildRunPaidAgentFlow(createMockDeps({ token: null })),
    );
    await expect(
      controller.runAgent('workspace-1', validBody, undefined),
    ).rejects.toBeInstanceOf(FlowHttpError);
  });
});
