# @pathline/nestjs

Thin [NestJS](https://nestjs.com) adapter for [Pathline](https://github.com/). NestJS keeps owning routing, DI, filters, and interceptors; Pathline provides a runner, an optional exception filter, and an optional trace interceptor.

## Install

```bash
pnpm add @pathline/nestjs @pathline/core
```

`@nestjs/common` and `rxjs` are peer dependencies.

## Usage

```ts
import { PathlineModule, FlowRunner, FlowHttpExceptionFilter } from '@pathline/nestjs';

@Module({ imports: [PathlineModule.forRoot({ tracing: true })] })
export class AppModule {}

@Controller('orders')
export class OrdersController {
  constructor(private readonly flowRunner: FlowRunner) {}

  @Post()
  @UseFilters(FlowHttpExceptionFilter)
  async create(@Body() body: unknown) {
    const result = await this.flowRunner.run(checkoutFlow, { input: { body } });
    if (!result.ok) throw toHttpError(result.error);
    return result.output;
  }
}
```

## Exports

- `PathlineModule.forRoot(options)` - global dynamic module.
- `FlowRunner` - injectable runner applying module defaults.
- `RequestScopedFlowRunner` - binds per-request deps via `withDependencies`.
- `FlowHttpExceptionFilter` - maps `FlowHttpError` to an HTTP response.
- `FlowTraceInterceptor` - logs flow-run results.

See [docs/nestjs.md](../../docs/nestjs.md) and [docs/adoption/nest-request-scope.md](../../docs/adoption/nest-request-scope.md).

## License

MIT
