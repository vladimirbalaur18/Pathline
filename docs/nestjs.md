# NestJS integration

`@pathline/nestjs` is a thin adapter. NestJS keeps owning routing, DI, filters, and interceptors; Pathline provides a runner, an optional exception filter, and an optional trace interceptor. Core never depends on Nest.

## Module

```ts
import { PathlineModule } from '@pathline/nestjs';

@Module({
  imports: [
    PathlineModule.forRoot({
      tracing: true,
      maxSteps: 10_000,
      onTrace: (event) => myLogger.debug(event),
      validateOnBootstrap: true,
      validationMode: 'error',
      registry: myFlowRegistry,
    }),
    AgentRunsModule,
  ],
})
export class AppModule {}
```

`forRoot` returns a global dynamic module exporting `FlowRunner`, `RequestScopedFlowRunner`, `FlowHttpExceptionFilter`, and `FlowTraceInterceptor`.

## FlowRunner

```ts
@Controller('/workspaces/:workspaceId/agent-runs')
export class AgentRunsController {
  constructor(
    private readonly flowRunner: FlowRunner,
    @Inject(RUN_PAID_AGENT_FLOW) private readonly flow: RunPaidAgentFlow,
  ) {}

  @Post()
  async run(@Param('workspaceId') workspaceId: string, @Body() body: unknown) {
    const result = await this.flowRunner.run(this.flow, { input: { workspaceId, body } });
    if (!result.ok) throw toHttpError(result.error);
    return result.output;
  }
}
```

## Provider factory

Build singleton flows from injected services:

```ts
@Module({
  providers: [
    {
      provide: RUN_PAID_AGENT_FLOW,
      useFactory: (auth: AuthService, billing: BillingService) =>
        buildRunPaidAgentFlow({ authService: auth, billingService: billing /* ... */ }),
      inject: [AuthService, BillingService],
    },
  ],
  exports: [RUN_PAID_AGENT_FLOW],
})
export class AgentRunsFlowModule {}
```

## Request-scoped dependencies

Flow **definitions are reusable**; **run context is per execution**. Dependencies may be singleton or request-scoped. See [adoption/nest-request-scope.md](adoption/nest-request-scope.md). For request-scoped deps use `RequestScopedFlowRunner`:

```ts
await this.requestScopedRunner.runWith(flow, perRequestDeps, { input });
```

## Exception filter

```ts
@UseFilters(FlowHttpExceptionFilter)
```

maps a thrown `FlowHttpError` to `{ statusCode, code, message, details }`.
