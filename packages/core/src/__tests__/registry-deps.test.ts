import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';
import { FlowRegistry } from '../registry/registry.js';
import { FlowValidationError } from '../errors/index.js';

interface Deps {
  billingService: unknown;
}

describe('dependency validation + registry', () => {
  it('throws MISSING_FLOW_DEPENDENCY when a declared dep is absent', () => {
    const f = flow<Record<string, unknown>, number, Deps>('Deps')
      .stage('A')
      .do(
        operation<Record<string, unknown>, Deps>('Load subscription')
          .dependsOn('billingService')
          .handler(() => {}),
      )
      .output(() => 1);

    expect(() => f.withDependencies({} as Deps)).toThrow(/MISSING_FLOW_DEPENDENCY/);
  });

  it('binds successfully when deps are present', async () => {
    const f = flow<Record<string, unknown>, number, Deps>('Deps')
      .stage('A')
      .do(
        operation<Record<string, unknown>, Deps>('Load subscription')
          .dependsOn('billingService')
          .handler(() => {}),
      )
      .output(() => 1);
    const bound = f.withDependencies({ billingService: {} });
    const result = await bound.run({});
    expect(result.ok).toBe(true);
  });

  it('FlowRegistry.validateAll fails fast in strict mode', () => {
    const broken = flow('Broken').stage('A').do(operation('x').handler(() => {})).goTo('Missing').output(() => 1);
    const registry = new FlowRegistry();
    registry.register(broken);
    expect(() => registry.validateAll({ strict: true })).toThrow(FlowValidationError);
  });

  it('FlowRegistry rejects duplicate flow names', () => {
    const a = flow('Same').stage('A').do(operation('x').handler(() => {})).output(() => 1);
    const b = flow('Same').stage('A').do(operation('y').handler(() => {})).output(() => 1);
    const registry = new FlowRegistry();
    registry.register(a);
    expect(() => registry.register(b)).toThrow(/already registered/);
  });
});
