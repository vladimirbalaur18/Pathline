/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AgentRunRequestBody } from '../run-paid-agent.context.js';

export interface AuthService {
  verifyAccessToken(authorization?: string): Promise<{ userId: string } | null>;
}
export interface UserService {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}
export interface WorkspaceService {
  findById(id: string): Promise<{ id: string } | null>;
}
export interface MembershipService {
  find(workspaceId: string, userId: string): Promise<{ role: string } | null>;
}
export interface BillingService {
  findSubscription(workspaceId: string): Promise<{ status: string; planId: string } | null>;
  findPlan(planId: string): Promise<{
    id: string;
    features: string[];
    monthlyAgentRuns: number;
    allowsOverage: boolean;
  } | null>;
  authorizeOverage(workspaceId: string): Promise<void>;
  voidOverage(workspaceId: string): Promise<void>;
}
export interface UsageService {
  getUsage(workspaceId: string): Promise<{ used: number; limit: number }>;
  reserve(workspaceId: string): Promise<{ id: string }>;
  commit(reservationId: string): Promise<void>;
  release(reservationId: string): Promise<void>;
}
export interface AiGateway {
  run(body: AgentRunRequestBody): Promise<{ output: string }>;
}
export interface AuditService {
  record(event: string, meta?: unknown): Promise<void>;
}
export interface EventBus {
  emit(event: string, payload?: unknown): Promise<void>;
}

export interface RunPaidAgentDeps {
  authService: AuthService;
  userService: UserService;
  workspaceService: WorkspaceService;
  membershipService: MembershipService;
  billingService: BillingService;
  usageService: UsageService;
  aiGateway: AiGateway;
  auditService: AuditService;
  eventBus: EventBus;
}

export interface PlanShape {
  id: string;
  features: string[];
  monthlyAgentRuns: number;
  allowsOverage: boolean;
}

export interface MockOverrides {
  plan?: PlanShape;
  usage?: { used: number; limit: number };
  subscriptionStatus?: string;
  token?: string | null;
}

/** Build in-memory fakes for all services so the flow runs without infra. */
export function createMockDeps(overrides: MockOverrides = {}): RunPaidAgentDeps {
  const plan = overrides.plan ?? {
    id: 'pro',
    features: ['agent-runs'],
    monthlyAgentRuns: 1000,
    allowsOverage: true,
  };
  const usage = overrides.usage ?? { used: 0, limit: 1000 };
  const subscriptionStatus = overrides.subscriptionStatus ?? 'active';
  const token = overrides.token === undefined ? 'valid-token' : overrides.token;

  return {
    authService: {
      async verifyAccessToken(authorization) {
        if (!authorization) return null;
        const provided = authorization.replace(/^Bearer\s+/i, '');
        return token && provided === token ? { userId: 'user-1' } : null;
      },
    },
    userService: {
      async findById(id) {
        return { id, name: 'Test User' };
      },
    },
    workspaceService: {
      async findById(id) {
        return { id };
      },
    },
    membershipService: {
      async find() {
        return { role: 'member' };
      },
    },
    billingService: {
      async findSubscription() {
        return { status: subscriptionStatus, planId: plan.id };
      },
      async findPlan() {
        return plan;
      },
      async authorizeOverage() {},
      async voidOverage() {},
    },
    usageService: {
      async getUsage() {
        return usage;
      },
      async reserve() {
        return { id: 'res-1' };
      },
      async commit() {},
      async release() {},
    },
    aiGateway: {
      async run(body) {
        return { output: `Completed: ${body.prompt}` };
      },
    },
    auditService: {
      async record() {},
    },
    eventBus: {
      async emit() {},
    },
  };
}
