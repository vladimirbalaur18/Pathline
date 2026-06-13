import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import { FlowRunner, FlowHttpExceptionFilter } from '@pathline/nestjs';
import { FlowError, FlowHttpError } from '@pathline/core';
import {
  RUN_PAID_AGENT_FLOW,
  type RunPaidAgentFlow,
} from './flows/run-paid-agent.flow.js';
import type {
  AgentRunRequestBody,
  RunPaidAgentResponse,
} from './run-paid-agent.context.js';

@Controller('/workspaces/:workspaceId/agent-runs')
@UseFilters(FlowHttpExceptionFilter)
export class AgentRunsController {
  constructor(
    private readonly flowRunner: FlowRunner,
    @Inject(RUN_PAID_AGENT_FLOW)
    private readonly runPaidAgentFlow: RunPaidAgentFlow,
  ) {}

  @Post()
  async runAgent(
    @Param('workspaceId') workspaceId: string,
    @Body() body: AgentRunRequestBody,
    @Headers('authorization') authorization?: string,
  ): Promise<RunPaidAgentResponse> {
    const result = await this.flowRunner.run(this.runPaidAgentFlow, {
      input: { workspaceId, authorization, body },
    });

    if (!result.ok) {
      const err = result.error;
      // Re-throw so the FlowHttpExceptionFilter can map it to an HTTP response.
      if (err?.statusCode !== undefined) {
        throw new FlowHttpError({
          statusCode: err.statusCode,
          code: err.code ?? 'FLOW_FAILED',
          message: err.message,
          details: err.details,
        });
      }
      throw new FlowError({
        message: err?.message ?? 'Flow failed',
        code: err?.code,
        details: err,
      });
    }

    return result.output!;
  }
}
