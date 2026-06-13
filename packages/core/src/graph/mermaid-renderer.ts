import type { FlowGraph, FlowGraphNode } from '../types.js';

/** Render a FlowGraph as a Mermaid `flowchart TD`. */
export function renderMermaid(graph: FlowGraph): string {
  const lines: string[] = ['flowchart TD'];
  const idMap = new Map<string, string>();

  graph.nodes.forEach((node, index) => {
    const safeId = `n${index}`;
    idMap.set(node.id, safeId);
    lines.push(`  ${safeId}${shape(node)}`);
  });

  for (const edge of graph.edges) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (!from || !to) continue;
    if (edge.label) {
      lines.push(`  ${from} -->|${escapeLabel(edge.label)}| ${to}`);
    } else {
      lines.push(`  ${from} --> ${to}`);
    }
  }

  return lines.join('\n');
}

function shape(node: FlowGraphNode): string {
  const label = escapeLabel(node.label);
  switch (node.kind) {
    case 'branch':
      return `{${label}}`;
    case 'repeat':
      return `[/${label}/]`;
    case 'parallel':
      return `[[${label}]]`;
    case 'flow':
    case 'output':
      return `([${label}])`;
    default:
      return `[${label}]`;
  }
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, "'").replace(/[[\]{}|]/g, ' ').trim();
}
