export interface AgentRunRequestBody {
  prompt: string;
  model: string;
  maxTokens: number;
}

export interface RunPaidAgentResponse {
  agentRunId: string;
  output: string;
  usedOverage: boolean;
}

export interface RunPaidAgentContext {
  input: {
    workspaceId: string;
    authorization?: string;
    body: AgentRunRequestBody;
  };
  auth?: { userId: string };
  user?: { id: string; name: string };
  workspace?: { id: string };
  membership?: { role: string };
  subscription?: { status: string; planId: string };
  plan?: {
    id: string;
    features: string[];
    monthlyAgentRuns: number;
    allowsOverage: boolean;
  };
  usage?: { used: number; limit: number };
  overageAuthorized?: boolean;
  reservation?: { id: string };
  agentResult?: { output: string };
  agentRunId?: string;
  response?: RunPaidAgentResponse;
}
