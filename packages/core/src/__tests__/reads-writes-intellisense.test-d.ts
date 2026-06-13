import { guard } from '../guard/guard.js';
import { operation } from '../operation/operation.js';

interface Ctx {
  userId: string;
  out?: string;
}

interface Deps {
  billingService: { charge: () => string };
  authService: { whoami: () => string };
}

operation<Ctx, Deps>('Patch ok')
  .writes('out')
  .handler(() => ({ out: 'ok' }));

operation<Ctx, Deps>('Patch bad')
  .writes('out')
  // @ts-expect-error undeclared patch key
  .handler(() => ({ userId: 'x' }));

guard<Ctx, Deps>('Auth gate')
  .dependsOn('authService')
  // @ts-expect-error undeclared guard dependency
  .check((_ctx, deps) => Boolean(deps.billingService));
