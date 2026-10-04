import { createHash } from 'node:crypto';
import { evaluateDecision } from '../../domain/decisions.js';
import type { DecisionSpec, Scalar } from '../../domain/decisions.js';

function regoLiteral(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(regoLiteral).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}: ${regoLiteral(item)}`)
      .join(', ')}}`;
  }
  return JSON.stringify(value);
}

function scalar(value: Scalar): string {
  return regoLiteral(value);
}

const regoKeywords = new Set([
  'as',
  'contains',
  'default',
  'else',
  'every',
  'false',
  'if',
  'import',
  'in',
  'not',
  'null',
  'package',
  'some',
  'true',
  'with',
]);

function inputReference(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !regoKeywords.has(name)
    ? `input.${name}`
    : `input[${JSON.stringify(name)}]`;
}

export function opaPackageName(decisionId: string): string {
  const safe = decisionId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const suffix = createHash('sha256').update(decisionId).digest('hex').slice(0, 12);
  return `prd.decision.${safe}_${suffix}`;
}

function typePredicate(type: DecisionSpec['inputs'][number]['type'], reference: string): string {
  return `is_${type}(${reference})`;
}

function domainPredicate(values: Scalar[] | undefined, reference: string): string[] {
  return values ? [`${reference} in ${regoLiteral(values)}`] : [];
}

export function generateDecisionRego(decisionId: string, spec: DecisionSpec): string {
  const packageName = opaPackageName(decisionId);
  const inputContract = spec.inputs.flatMap(input => {
    const reference = inputReference(input.name);
    return [
      `\t${typePredicate(input.type, reference)}`,
      ...domainPredicate(input.values, reference).map(line => `\t${line}`),
    ];
  });
  const outputContract = [
    `\t${typePredicate(spec.output.type, 'value')}`,
    ...domainPredicate(spec.output.values, 'value').map(line => `\t${line}`),
  ];
  const rules = spec.rules.map(rule => {
    const conditions = Object.entries(rule.when)
      .map(([name, value]) => `\t${inputReference(name)} == ${scalar(value)}`)
      .join('\n');
    const body = conditions || '\t# wildcard: this row has no input conditions\n\ttrue';
    return `matches contains {"value": ${scalar(rule.then)}, "ruleId": ${JSON.stringify(rule.id)}} if {\n\tvalid_input\n${body}\n}`;
  });

  return [
    `package ${packageName}`,
    '',
    `decision_id := ${regoLiteral(decisionId)}`,
    '',
    `input_names := ${regoLiteral(spec.inputs.map(input => input.name))}`,
    '',
    'valid_input if {',
    '\tis_object(input)',
    '\tcount(input) == count(input_names)',
    '\tevery name in input_names {',
    '\t\tobject.get(input, name, {"missing": true}) != {"missing": true}',
    '\t}',
    ...inputContract,
    '}',
    '',
    'output_valid(value) if {',
    ...outputContract,
    '}',
    '',
    '# Keeps the matches set defined for an empty or fully filtered rule table.',
    'matches contains {"value": false, "ruleId": ""} if {',
    '\tfalse',
    '}',
    '',
    ...rules.flatMap(rule => [rule, '']),
    'evaluation := {"status": "invalid_input"} if {',
    '\tnot valid_input',
    '}',
    '',
    'evaluation := {"status": "gap", "ruleIds": []} if {',
    '\tvalid_input',
    '\tcount(matches) == 0',
    '}',
    '',
    'evaluation := {"status": "overlap", "ruleIds": rule_ids} if {',
    '\tvalid_input',
    '\tcount(matches) > 1',
    '\trule_ids := sort([rule.ruleId | some rule in matches])',
    '}',
    '',
    'evaluation := {"status": "invalid_output", "ruleId": item.ruleId} if {',
    '\tvalid_input',
    '\tcount(matches) == 1',
    '\titem := matches[_]',
    '\tnot output_valid(item.value)',
    '}',
    '',
    'evaluation := {"status": "unique", "value": item.value, "ruleId": item.ruleId} if {',
    '\tvalid_input',
    '\tcount(matches) == 1',
    '\titem := matches[_]',
    '\toutput_valid(item.value)',
    '}',
    '',
    'result := item if {',
    '\tevaluation.status == "unique"',
    '\titem := {"value": evaluation.value, "ruleId": evaluation.ruleId}',
    '}',
    '',
    'batch := [outcome |',
    '\tsome item in input',
    '\toutcome := evaluation with input as item',
    ']',
    '',
  ].join('\n');
}

export function generateDecisionTestRego(decisionId: string, spec: DecisionSpec): string {
  const packageName = opaPackageName(decisionId);
  const cases = spec.cases.map(testCase => ({
    id: testCase.id,
    input: testCase.input,
    expected: evaluateDecision(spec, testCase.input),
  }));
  const seed = spec.cases[0]?.input;
  const firstInput = spec.inputs[0];
  const invalidInputs: Record<string, unknown>[] = [];
  if (seed && firstInput) {
    const missing = { ...seed } as Record<string, unknown>;
    delete missing[firstInput.name];
    invalidInputs.push(
      { ...seed, __unexpected: true },
      missing,
      {
        ...seed,
        [firstInput.name]: firstInput.type === 'string' ? false : '__wrong_type__',
      },
    );
  }

  const arrayRule = (name: string, values: unknown[]) => [
    `${name} := [`,
    ...values.map(value => `\t${regoLiteral(value)},`),
    ']',
  ];

  return [
    `package ${packageName}_test`,
    '',
    `import data.${packageName}.evaluation`,
    '',
    ...arrayRule('decision_cases', cases),
    '',
    ...arrayRule('invalid_inputs', invalidInputs),
    '',
    'test_declared_decision_cases if {',
    '\tevery case in decision_cases {',
    '\t\tactual := evaluation with input as case.input',
    '\t\tactual.status == "unique"',
    '\t\tactual.value == case.expected.value',
    '\t\tactual.ruleId == case.expected.ruleId',
    '\t}',
    '}',
    '',
    'test_input_contract if {',
    '\tevery invalid_input in invalid_inputs {',
    '\t\tactual := evaluation with input as invalid_input',
    '\t\tactual.status == "invalid_input"',
    '\t}',
    '}',
    '',
  ].join('\n');
}
