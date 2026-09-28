import type { Edge, Model } from './model.js';
export function graph(model: Model, id?: string, direction: 'in' | 'out' | 'both' = 'both', depth = 10000) {
  const all = [...model.artifacts.map(s => ({ id: s.artifact.metadata.id, kind: s.artifact.kind, title: s.artifact.metadata.title })), ...model.scenarios.map(s => ({ id: s.id, kind: 'Scenario', title: s.name }))];
  const visited = new Set(id ? [id] : all.map(n => n.id));
  let frontier = id ? [id] : [];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next = new Set<string>();
    for (const e of model.edges) {
      if (direction !== 'in' && frontier.includes(e.from) && !visited.has(e.to)) next.add(e.to);
      if (direction !== 'out' && frontier.includes(e.to) && !visited.has(e.from)) next.add(e.from);
    }
    for (const n of next) visited.add(n); frontier = [...next];
  }
  return { nodes: all.filter(n => visited.has(n.id)).sort((a, b) => a.id.localeCompare(b.id)), edges: model.edges.filter(e => visited.has(e.from) && visited.has(e.to)) };
}
export function mermaid(data: ReturnType<typeof graph>): string {
  const ids = new Map(data.nodes.map((n, i) => [n.id, `n${i}`]));
  const safe = (s: string) => s.replace(/[^\p{L}\p{N} _.:/-]/gu, '_');
  return ['flowchart TD', ...data.nodes.map(n => `  ${ids.get(n.id)}["${safe(n.id)}: ${safe(n.title)}"]`), ...data.edges.map(e => `  ${ids.get(e.from)} -->|${safe(e.relation)}| ${ids.get(e.to)}`)].join('\n');
}
export function uniqueEdges(edges: Edge[]): Edge[] { return [...new Map(edges.map(e => [JSON.stringify(e), e])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); }
