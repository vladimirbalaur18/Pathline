import { describe, expect, it } from 'vitest';
import { flow } from '../flow/flow.js';
import { operation } from '../operation/operation.js';

const op = (name: string) => operation(name).handler(() => {});

function build() {
  return flow('Run paid AI agent')
    .version('1.0.0')
    .stage('Request')
    .do(op('Parse request body'))
    .do(op('Authenticate user'))
    .stage('Workspace access')
    .parallel('Load access data', (p) =>
      p.do(op('Load membership')).do(op('Load subscription')).do(op('Load usage')),
    )
    .stage('Billing gate')
    .branch('Usage quota', (b) =>
      b
        .when('Within included quota', () => true)
        .goTo('Reserve usage')
        .otherwise()
        .goTo('Reject'),
    )
    .stage('Reserve usage')
    .do(op('Reserve usage'))
    .stage('Reject')
    .fail({ statusCode: 402, code: 'QUOTA', message: 'over' })
    .onFailure()
    .do(op('Release reserved usage'))
    .finally()
    .do(op('Write audit log'))
    .output(() => null);
}

describe('describe(), toGraph(), toMermaid()', () => {
  it('describe() renders a readable indented map', () => {
    const text = build().describe();
    expect(text).toContain('Run paid AI agent (v1.0.0)');
    expect(text).toContain('Request');
    expect(text).toContain('- Parse request body');
    expect(text).toContain('- Parallel: Load access data');
    expect(text).toContain('    - Load membership');
    expect(text).toContain('- Branch: Usage quota');
    expect(text).toContain('On failure');
    expect(text).toContain('Finally');
  });

  it('describe() renders repeat blocks with bounds', () => {
    const text = flow('Search')
      .stage('Search best schedule')
      .repeat('Generate candidate schedules', (r) =>
        r
          .maxAttempts(500)
          .timeBudgetMs(3000)
          .stopWhen('perfect balance reached', () => false)
          .do(op('Reset generation state'))
          .do(op('Build candidate schedule')),
      )
      .output(() => null)
      .describe();
    expect(text).toContain('- Repeat: Generate candidate schedules');
    expect(text).toContain('- Max attempts: 500');
    expect(text).toContain('- Time budget: 3000ms');
    expect(text).toContain('- Stop when: perfect balance reached');
  });

  it('toGraph() produces nodes and edges including failure/finally', () => {
    const graph = build().toGraph();
    const kinds = new Set(graph.nodes.map((n) => n.kind));
    expect(kinds.has('flow')).toBe(true);
    expect(kinds.has('stage')).toBe(true);
    expect(kinds.has('branch')).toBe(true);
    expect(kinds.has('parallel')).toBe(true);
    expect(kinds.has('failure')).toBe(true);
    expect(kinds.has('finally')).toBe(true);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('toMermaid() emits a flowchart', () => {
    const mermaid = build().toMermaid();
    expect(mermaid.startsWith('flowchart TD')).toBe(true);
    expect(mermaid).toContain('-->');
  });
});
