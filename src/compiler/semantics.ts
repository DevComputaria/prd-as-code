import { PREFIX, isRecord } from '../domain/model.js';
import type { Diagnostic, Edge, Scenario, SourceArtifact } from '../domain/model.js';
import { analyzeDecision } from '../domain/decisions.js';
import type { DecisionSpec } from '../domain/decisions.js';
import { uniqueEdges } from '../domain/graph.js';
interface ProcessSpec {
  nodes: { id: string; type: string; decisionRef?: string }[];
  flows: { id: string; from: string; to: string; label?: string; default?: boolean }[];
  scenarios?: string[];
}
export function inspectSemantics(sources: SourceArtifact[], scenarios: Scenario[]) {
  const diagnostics: Diagnostic[] = [], edges: Edge[] = [], byId = new Map(sources.map(s => [s.artifact.metadata.id, s]));
  const seen = new Set<string>();
  function issue(code: string, message: string, source?: SourceArtifact, severity: Diagnostic['severity'] = 'error') {
    diagnostics.push({ code, severity, message, file: source?.path, artifactId: source?.artifact.metadata.id });
  }
  function reference(source: SourceArtifact, target: string, relation: string, kinds?: string[]) {
    const [id, fragment] = target.split('#'), found = byId.get(id!);
    if (!found) { issue('UNRESOLVED_REFERENCE', `${target} does not exist.`, source); return; }
    if (kinds && !kinds.includes(found.artifact.kind)) issue('REFERENCE_TYPE', `${target} must be ${kinds.join(' or ')}.`, source);
    if (fragment && (found.artifact.kind !== 'Process' || !(found.artifact.spec as unknown as ProcessSpec).nodes.some(n => n.id === fragment))) issue('UNKNOWN_ELEMENT', `${target} does not identify a process node.`, source);
    if (id === source.artifact.metadata.id && !fragment) issue('SELF_REFERENCE', `Self-reference ${id}.`, source);
    edges.push({ from: source.artifact.metadata.id, to: id!, relation });
  }
  const relationTargets: Record<string, string[]> = { 'governed-by': ['BusinessRule'], 'performed-by': ['Actor'], defines: ['Term'], satisfies: ['Requirement'], 'realized-by': ['Process', 'Decision', 'UseCase'], verifies: ['Requirement', 'BusinessRule', 'Decision', 'Process', 'Behavior'] };
  for (const s of sources) {
    const { artifact: a } = s, id = a.metadata.id, spec = a.spec;
    if (seen.has(id)) issue('DUPLICATE_ID', `Duplicate ID ${id}.`, s); seen.add(id);
    if (!id.startsWith(PREFIX[a.kind] + '-')) issue('ID_PREFIX', `${a.kind} requires prefix ${PREFIX[a.kind]}-.`, s);
    for (const link of a.links ?? []) reference(s, link.target, link.relation, relationTargets[link.relation]);
    if (a.kind === 'Requirement' && typeof spec.parentRef === 'string') reference(s, spec.parentRef, 'parent', ['Requirement']);
    if (a.kind === 'FactType') {
      const roles = spec.roles as { name: string; conceptRef: string }[];
      if (new Set(roles.map(r => r.name)).size !== roles.length) issue('DUPLICATE_ROLE', 'Fact roles must be unique.', s);
      for (const role of roles) reference(s, role.conceptRef, 'uses-concept', ['Term']);
    }
    if (a.kind === 'BusinessRule') {
      if (!isRecord(spec.formulation)) issue('NARRATIVE_RULE', 'Narrative-only rule: no structured formulation to type-check.', s, 'unsupported');
      else {
        const f = spec.formulation, q = f.forEach as { variable: string; conceptRef: string };
        reference(s, q.conceptRef, 'quantifies', ['Term']);
        function expression(e: unknown) {
          if (!isRecord(e)) return;
          if (typeof e.factRef === 'string') {
            reference(s, e.factRef, 'uses-fact', ['FactType']);
            const fact = byId.get(e.factRef), bindings = e.bindings as Record<string, string>;
            if (fact?.artifact.kind === 'FactType') {
              const roles = fact.artifact.spec.roles as { name: string; conceptRef: string }[];
              if (Object.keys(bindings).length !== roles.length || roles.some(r => bindings[r.name] !== q.variable || r.conceptRef !== q.conceptRef)) issue('BINDING_TYPE', 'Bindings must supply every fact role with the declared variable of matching concept type.', s);
            }
          }
          for (const value of Object.values(e)) if (Array.isArray(value)) value.forEach(expression); else if (isRecord(value)) expression(value);
        }
        expression(f.assertion);
      }
    }
    if (a.kind === 'Decision') {
      const d = spec as unknown as DecisionSpec;
      if (new Set(d.inputs.map(i => i.name)).size !== d.inputs.length) issue('DUPLICATE_INPUT', 'Decision input names must be unique.', s);
      for (const declaration of [...d.inputs, d.output]) if (declaration.values?.some(v => typeof v !== declaration.type)) issue('DOMAIN_TYPE', `Values for ${declaration.name} must match ${declaration.type}.`, s);
      if (new Set(d.rules.map(r => r.id)).size !== d.rules.length || new Set(d.cases.map(c => c.id)).size !== d.cases.length) issue('DUPLICATE_CASE_OR_ROW', 'Decision rows and cases require unique IDs.', s);
      for (const rule of d.rules) {
        if (typeof rule.then !== d.output.type || (d.output.values && !d.output.values.includes(rule.then))) issue('OUTPUT_TYPE', `Row ${rule.id} has an invalid output.`, s);
        for (const [name, value] of Object.entries(rule.when)) {
          const input = d.inputs.find(i => i.name === name);
          if (!input || typeof value !== input.type || (input.values && !input.values.includes(value))) issue('INPUT_TYPE', `Row ${rule.id}: invalid condition ${name}.`, s);
        }
      }
      for (const c of d.cases) {
        if (typeof c.expected !== d.output.type || (d.output.values && !d.output.values.includes(c.expected))) issue('EXPECTED_TYPE', `Case ${c.id}: invalid expected result.`, s);
        if (c.scenario) {
          if (!scenarios.some(sc => sc.id === c.scenario)) issue('UNKNOWN_SCENARIO', `${c.scenario} does not exist.`, s);
          else edges.push({ from: c.scenario, to: id, relation: 'tests-decision' });
        }
      }
      const analysis = analyzeDecision(d);
      if (analysis.status === 'inconclusive') issue('DECISION_ANALYSIS_INCONCLUSIVE', 'Exhaustive analysis needs finite domains with at most 4096 combinations.', s, 'unsupported');
      for (const conflict of analysis.issues) issue(conflict.code, `Decision counterexample: ${JSON.stringify(conflict.input)}`, s);
    }
    if (a.kind === 'Process') {
      const p = spec as unknown as ProcessSpec, ids = new Set(p.nodes.map(n => n.id));
      if (ids.size !== p.nodes.length || new Set(p.flows.map(f => f.id)).size !== p.flows.length) issue('DUPLICATE_ELEMENT', 'Process node and flow IDs must be unique in their respective sets.', s);
      if (p.nodes.filter(n => n.type === 'startEvent').length !== 1 || !p.nodes.some(n => n.type === 'endEvent')) issue('PROCESS_BOUNDARY', 'Profile requires exactly one start and at least one end.', s);
      for (const flow of p.flows) if (!ids.has(flow.from) || !ids.has(flow.to)) issue('UNKNOWN_NODE', `Flow ${flow.id} targets an unknown node.`, s);
      for (const node of p.nodes) {
        const incoming = p.flows.filter(f => f.to === node.id), outgoing = p.flows.filter(f => f.from === node.id);
        if (node.type === 'startEvent' ? incoming.length !== 0 : incoming.length === 0) issue('PROCESS_INCOMING', `Invalid incoming flows for ${node.id}.`, s);
        if (node.type === 'endEvent' ? outgoing.length !== 0 : node.type === 'exclusiveGateway' ? outgoing.length < 2 : outgoing.length !== 1) issue('PROCESS_OUTGOING', `Invalid outgoing flows for ${node.id}.`, s);
        if (node.type === 'exclusiveGateway' && (outgoing.filter(f => f.default).length !== 1 || outgoing.some(f => !f.default && !f.label))) issue('GATEWAY_BRANCHES', 'Exclusive gateway requires one default and labels for other branches; labels are descriptive, not executable conditions.', s);
        if (node.type === 'businessRuleTask' && !node.decisionRef) issue('DECISION_REQUIRED', `${node.id} requires decisionRef.`, s);
        if (node.decisionRef) reference(s, node.decisionRef, 'calls-decision', ['Decision']);
      }
      const starts = p.nodes.filter(n => n.type === 'startEvent').map(n => n.id), reached = new Set(starts);
      let changed = true;
      while (changed) { changed = false; for (const f of p.flows) if (reached.has(f.from) && !reached.has(f.to)) { reached.add(f.to); changed = true; } }
      for (const node of p.nodes) if (!reached.has(node.id)) issue('UNREACHABLE_NODE', `${node.id} is unreachable.`, s);
      const degrees = new Map(p.nodes.map(n => [n.id, p.flows.filter(f => f.to === n.id).length]));
      const queue = [...degrees].filter(([, d]) => d === 0).map(([id]) => id); let removed = 0;
      while (queue.length) { const n = queue.shift()!; removed++; for (const f of p.flows.filter(f => f.from === n)) { const d = (degrees.get(f.to) ?? 0) - 1; degrees.set(f.to, d); if (d === 0) queue.push(f.to); } }
      if (removed !== p.nodes.length) issue('PROCESS_CYCLE_UNSUPPORTED', 'process-basic/v1 supports acyclic models only.', s, 'unsupported');
      for (const scenario of p.scenarios ?? []) if (!scenarios.some(sc => sc.id === scenario)) issue('UNKNOWN_SCENARIO', `${scenario} does not exist.`, s); else edges.push({ from: scenario, to: id, relation: 'illustrates' });
    }
    if (a.kind === 'Evidence') {
      reference(s, spec.subjectRef as string, 'evidence-for');
      const subject = byId.get(spec.subjectRef as string);
      if (subject && subject.digest !== spec.subjectDigest) issue('STALE_EVIDENCE', 'Evidence is pinned to an older artifact digest.', s);
      if (Number.isNaN(Date.parse(spec.executedAt as string))) issue('INVALID_TIMESTAMP', 'executedAt must be a parseable timestamp.', s);
    }
    if (a.kind === 'OpenQuestion' && spec.blocking === true) issue('OPEN_QUESTION', spec.question as string, s, 'unsupported');
  }
  for (const sc of scenarios) {
    if (seen.has(sc.id)) diagnostics.push({ code: 'DUPLICATE_ID', severity: 'error', file: sc.file, line: sc.line, message: `Duplicate ID ${sc.id}.` }); seen.add(sc.id);
    for (const [prefix, kind, relation] of [['@process_', 'Process', 'illustrates'], ['@requirement_', 'Requirement', 'verifies'], ['@rule_', 'BusinessRule', 'illustrates-rule']]) for (const tag of sc.tags.filter(t => t.startsWith(prefix!))) {
      const target = tag.slice(prefix!.length), found = byId.get(target);
      if (!found || found.artifact.kind !== kind) diagnostics.push({ code: 'INVALID_SCENARIO_REFERENCE', severity: 'error', file: sc.file, line: sc.line, message: `Tag ${tag} must target ${kind}.` });
      else edges.push({ from: sc.id, to: target, relation: relation! });
    }
  }
  // Dependency and requirement-parent cycles are rejected; other graph cycles are allowed.
  for (const relation of ['depends-on', 'parent']) {
    const visited = new Set<string>(), active = new Set<string>();
    function visit(id: string): void { if (active.has(id)) { issue('DEPENDENCY_CYCLE', `${relation} cycle at ${id}.`); return; } if (visited.has(id)) return; active.add(id); for (const e of edges.filter(e => e.from === id && e.relation === relation)) visit(e.to); active.delete(id); visited.add(id); }
    for (const id of byId.keys()) visit(id);
  }
  return { diagnostics, edges: uniqueEdges(edges) };
}
