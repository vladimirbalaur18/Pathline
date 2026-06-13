import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';

const op = (name: string) => operation(name).handler(() => {});

describe('validate()', () => {
  it('passes a well-formed flow', () => {
    const f = flow('Good')
      .stage('A')
      .do(op('one'))
      .output(() => 1);
    const result = f.validate();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('flags missing output and empty flow', () => {
    const f = flow('Empty').build();
    const result = f.validate();
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('EMPTY_FLOW');
    expect(result.errors.map((e) => e.code)).toContain('MISSING_OUTPUT');
  });

  it('flags duplicate stage names and goTo target missing', () => {
    const f = flow('Dup')
      .stage('A')
      .do(op('one'))
      .goTo('Nope')
      .stage('A')
      .do(op('two'))
      .output(() => 1);
    const codes = f.validate().errors.map((e) => e.code);
    expect(codes).toContain('DUPLICATE_STAGE_NAME');
    expect(codes).toContain('GOTO_TARGET_MISSING');
  });

  it('flags duplicate operation names within a stage', () => {
    const f = flow('Dup')
      .stage('A')
      .do(op('same'))
      .do(op('same'))
      .output(() => 1);
    expect(f.validate().errors.map((e) => e.code)).toContain('DUPLICATE_OPERATION_NAME');
  });

  it('flags empty parallel and unbounded/empty repeat', () => {
    const f = flow('Bad')
      .stage('A')
      .parallel('p', (p) => p)
      .repeat('r', (r) => r)
      .output(() => 1);
    const codes = f.validate().errors.map((e) => e.code);
    expect(codes).toContain('PARALLEL_EMPTY');
    expect(codes).toContain('REPEAT_EMPTY');
    expect(codes).toContain('REPEAT_UNBOUNDED');
  });

  it('warns on parallel write conflict and errors in strict mode', () => {
    const f = flow('Conflict')
      .stage('A')
      .parallel('p', (p) =>
        p
          .do(operation('w1').writes('shared').handler(() => {}))
          .do(operation('w2').writes('shared').handler(() => {})),
      )
      .output(() => 1);
    expect(f.validate().warnings.map((w) => w.code)).toContain('PARALLEL_WRITE_CONFLICT');
    expect(f.validate({ strict: true }).errors.map((e) => e.code)).toContain('PARALLEL_WRITE_CONFLICT');
  });

  it('flags repeat signals used outside a repeat', () => {
    const f = flow('Bad')
      .stage('A')
      .branch('b', (br) => br.otherwise().stopRepeat())
      .output(() => 1);
    expect(f.validate().errors.map((e) => e.code)).toContain('REPEAT_SIGNAL_OUTSIDE_REPEAT');
  });

  it('warns on unreachable stage', () => {
    const f = flow('Unreachable')
      .stage('A')
      .do(op('one'))
      .goTo('C')
      .stage('B')
      .do(op('two'))
      .stage('C')
      .do(op('three'))
      .output(() => 1);
    expect(f.validate().warnings.map((w) => w.code)).toContain('UNREACHABLE_STAGE');
  });
});
