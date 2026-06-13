/**
 * Compile-time checks for dependsOn / reads / writes IntelliSense constraints.
 * Included by `tsc --noEmit` (not executed at runtime).
 */
import { operation } from '../operation/operation.js';
import type { ContextKey, DepKey } from '../types.js';

interface Ctx {
  userId: string;
  out?: string;
}

interface Deps {
  billingService: { charge: () => string };
  authService: { whoami: () => string };
}

type _BillingKey = DepKey<Deps>;
const _billingKey: _BillingKey = 'billingService';

type _UserIdKey = ContextKey<Ctx>;
const _userIdKey: _UserIdKey = 'userId';

// Valid keys — must compile
operation<Ctx, Deps>('Ok')
  .dependsOn('billingService')
  .dependsOn('authService')
  .dependsOn('billingService', 'authService')
  .reads('userId')
  .writes('out')
  .handler(() => {});

// Invalid keys — must fail
operation<Ctx, Deps>('Bad dep')
  // @ts-expect-error unknown dependency key
  .dependsOn('nope');

operation<Ctx, Deps>('Bad read')
  // @ts-expect-error unknown context key
  .reads('missing');

operation<Ctx, Deps>('Bad write')
  // @ts-expect-error unknown context key
  .writes('missing');
