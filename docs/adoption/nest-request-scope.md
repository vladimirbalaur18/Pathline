# NestJS request scope

Key rule:

> Flow definitions are reusable. Run context is per execution. Dependencies may be singleton or request-scoped depending on your Nest provider setup.

A flow definition is built once and run many times. The per-request data lives in the **context** you pass to `run()`, never inside the flow definition. Do not store request data on the definition.

## Option A: singleton dependencies (recommended for v1)

If your services are singletons (the common case), build the flow once via a provider factory and inject it:

```ts
{
  provide: RUN_PAID_AGENT_FLOW,
  useFactory: (auth: AuthService, billing: BillingService) =>
    buildRunPaidAgentFlow({ authService: auth, billingService: billing }),
  inject: [AuthService, BillingService],
}
```

The controller passes per-request data as context:

```ts
await this.flowRunner.run(this.flow, { input: { workspaceId, body } });
```

## Option B: request-scoped dependencies

If a dependency is `Scope.REQUEST` (e.g. it reads the current request/tenant), a plain singleton `useFactory` would capture the **wrong** instance. Build the flow **without binding deps** (finish with `.output(...)`, skip `withDependencies`) and let `RequestScopedFlowRunner` bind per-request deps right before running:

```ts
// Built once, deps NOT bound:
export const checkoutFlow = flow<Ctx, Out, Deps>('Checkout')
  .stage('Run')
  .do(chargeOrder) // chargeOrder.dependsOn('paymentService')
  .output((ctx) => ctx.response!);

@Injectable({ scope: Scope.REQUEST })
export class CheckoutController {
  constructor(
    private readonly runner: RequestScopedFlowRunner,
    private readonly paymentService: PaymentService, // request-scoped
  ) {}

  @Post()
  async run(@Body() body: unknown) {
    return this.runner.runWith(
      checkoutFlow,
      { paymentService: this.paymentService },
      { input: { body } },
    );
  }
}
```

`runWith(flow, deps, ctx)` calls `flow.withDependencies(deps)` per request, so each request uses its own provider instances (and dependency validation runs per bind).

## Pitfall

Binding a request-scoped provider inside a singleton `useFactory` silently captures a stale instance. Prefer Option A when all deps are singletons, and Option B when any dependency is request-scoped.
