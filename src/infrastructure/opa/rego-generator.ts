import type { DecisionSpec, Scalar } from '../../domain/decisions.js';

function scalar(value: Scalar): string {
  return JSON.stringify(value);
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
  return `prd.decision.${safe}`;
}

export function generateDecisionRego(decisionId: string, spec: DecisionSpec): string {
  const packageName = opaPackageName(decisionId);
  const rules = spec.rules.map(rule => {
    const conditions = Object.entries(rule.when)
      .map(([name, value]) => `\t${inputReference(name)} == ${scalar(value)}`)
      .join('\n');
    const body = conditions || '\ttrue';
    return `matches contains {"value": ${scalar(rule.then)}, "ruleId": ${JSON.stringify(rule.id)}} if {\n${body}\n}`;
  });

  return [
    `package ${packageName}`,
    '',
    ...rules.flatMap(rule => [rule, '']),
    'result := item if {',
    '\tcount(matches) == 1',
    '\titem := matches[_]',
    '}',
    '',
  ].join('\n');
}
