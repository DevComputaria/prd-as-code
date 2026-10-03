import type { DecisionSpec, Scalar } from '../../domain/decisions.js';

function scalar(value: Scalar): string {
  return JSON.stringify(value);
}

export function opaPackageName(decisionId: string): string {
  const safe = decisionId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `prd.decision.${safe}`;
}

export function generateDecisionRego(decisionId: string, spec: DecisionSpec): string {
  const packageName = opaPackageName(decisionId);
  const rules = spec.rules.map(rule => {
    const conditions = Object.entries(rule.when)
      .map(([name, value]) => `  input[${JSON.stringify(name)}] == ${scalar(value)}`)
      .join('\n');
    const body = conditions || '  true';
    return `matches contains {"value": ${scalar(rule.then)}, "ruleId": ${JSON.stringify(rule.id)}} if {\n${body}\n}`;
  });

  return [
    `package ${packageName}`,
    '',
    ...rules.flatMap(rule => [rule, '']),
    'result := item if {',
    '  count(matches) == 1',
    '  item := matches[_]',
    '}',
    '',
  ].join('\n');
}
