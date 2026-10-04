import { IntentError, sortedJson } from './model.js';
export type Scalar = boolean | number | string;
export interface DecisionSpec {
  profile: 'dmn-table/v1'; hitPolicy: 'UNIQUE';
  inputs: { name: string; type: 'boolean' | 'number' | 'string'; values?: Scalar[] }[];
  output: { name: string; type: 'boolean' | 'number' | 'string'; values?: Scalar[] };
  rules: { id: string; when: Record<string, Scalar>; then: Scalar }[];
  cases: { id: string; scenario?: string; input: Record<string, Scalar>; expected: Scalar }[];
}

export function validateDecisionInput(
  spec: DecisionSpec,
  input: unknown,
): asserts input is Record<string, Scalar> {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).length !== spec.inputs.length ||
    spec.inputs.some(i => typeof (input as Record<string, unknown>)[i.name] !== i.type ||
      (i.type === 'number' && !Number.isFinite((input as Record<string, unknown>)[i.name])) ||
      (i.values && !i.values.includes((input as Record<string, unknown>)[i.name] as Scalar)))) {
    throw new IntentError(
      'INVALID_INPUT',
      'Decision inputs must exactly match declared names, types, and domains.',
    );
  }
}

export function evaluateDecision(spec: DecisionSpec, input: Record<string, unknown>) {
  validateDecisionInput(spec, input);
  const matches = spec.rules.filter(r => Object.entries(r.when).every(([key, value]) => input[key] === value));
  if (matches.length !== 1) throw new IntentError(matches.length ? 'DECISION_OVERLAP' : 'DECISION_GAP', `UNIQUE decision matched ${matches.length} rows.`);
  const value = matches[0]!.then;
  if (typeof value !== spec.output.type ||
    (spec.output.type === 'number' && !Number.isFinite(value)) ||
    (spec.output.values && !spec.output.values.includes(value))) {
    throw new IntentError(
      'INVALID_DECISION_OUTPUT',
      'Decision output must match its declared type and domain.',
    );
  }
  return { value, ruleId: matches[0]!.id };
}
export function analyzeDecision(spec: DecisionSpec) {
  const domains = spec.inputs.map(i => i.values ?? (i.type === 'boolean' ? [false, true] : undefined));
  if (domains.some(d => !d) || domains.reduce((n, d) => n * (d?.length ?? 0), 1) > 4096) return { status: 'inconclusive', checked: 0, issues: [] as { code: string; input: Record<string, Scalar> }[] };
  let inputs: Record<string, Scalar>[] = [{}];
  for (let i = 0; i < spec.inputs.length; i++) inputs = inputs.flatMap(p => domains[i]!.map(v => ({ ...p, [spec.inputs[i]!.name]: v })));
  const issues: { code: string; input: Record<string, Scalar> }[] = [];
  for (const input of inputs) { try { evaluateDecision(spec, input); } catch (e) { issues.push({ code: (e as IntentError).code, input }); } }
  return { status: issues.length ? 'invalid' : 'valid', checked: inputs.length, issues };
}
export function decisionTests(spec: DecisionSpec) {
  return spec.cases.map(c => {
    try { const actual = evaluateDecision(spec, c.input); return { id: c.id, scenario: c.scenario, passed: sortedJson(actual.value) === sortedJson(c.expected), expected: c.expected, actual: actual.value, ruleId: actual.ruleId }; }
    catch (e) { return { id: c.id, scenario: c.scenario, passed: false, error: (e as Error).message }; }
  });
}
