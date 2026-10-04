import test from 'node:test';
import assert from 'node:assert/strict';
import { conformDecision } from '../dist/application/decision-conformance.js';
import { ReferenceDecisionRuntime } from '../dist/infrastructure/reference/reference-decision-runtime.js';
import { generateDecisionRego, opaPackageName } from '../dist/infrastructure/opa/rego-generator.js';

const spec = {
  profile: 'dmn-table/v1',
  hitPolicy: 'UNIQUE',
  inputs: [
    { name: 'active', type: 'boolean' },
    { name: 'funded', type: 'boolean' },
  ],
  output: {
    name: 'result',
    type: 'string',
    values: ['ALLOW', 'DENY'],
  },
  rules: [
    { id: 'allow', when: { active: true, funded: true }, then: 'ALLOW' },
    { id: 'inactive', when: { active: false }, then: 'DENY' },
    { id: 'unfunded', when: { active: true, funded: false }, then: 'DENY' },
  ],
  cases: [
    { id: 'C-1', input: { active: true, funded: true }, expected: 'ALLOW' },
    { id: 'C-2', input: { active: false, funded: true }, expected: 'DENY' },
    { id: 'C-3', input: { active: false, funded: false }, expected: 'DENY' },
    { id: 'C-4', input: { active: true, funded: false }, expected: 'DENY' },
  ],
};

test('reference runtime conforms to current decision semantics', async () => {
  const result = await conformDecision('DEC-TEST', spec, new ReferenceDecisionRuntime());
  assert.equal(result.passed, true);
  assert.equal(result.matched, 4);
  assert.equal(result.divergent, 0);
});

test('conformance detects a divergent candidate runtime', async () => {
  const runtime = {
    name: 'broken',
    async evaluate(request) {
      const reference = await new ReferenceDecisionRuntime().evaluate(request);
      return request.input.active === true && request.input.funded === true
        ? { value: 'DENY', ruleId: reference.ruleId }
        : reference;
    },
  };
  const result = await conformDecision('DEC-TEST', spec, runtime);
  assert.equal(result.passed, false);
  assert.equal(result.divergent, 1);
  assert.equal(result.cases.find(c => c.id === 'C-1').passed, false);
});

test('rego generator preserves decision ids, values and wildcard rows', () => {
  const rego = generateDecisionRego('DEC-TEST', spec);
  assert.equal(opaPackageName('DEC-TEST'), 'prd.decision.dec_test');
  assert.match(rego, /package prd\.decision\.dec_test/);
  assert.match(rego, /input\.active == true/);
  assert.match(rego, /"ruleId": "allow"/);
  assert.match(rego, /count\(matches\) == 1/);
});

test('rego generator uses bracket notation for reserved Rego keywords', () => {
  const keywordSpec = {
    ...spec,
    inputs: [{ name: 'if', type: 'boolean' }],
    rules: [{ id: 'keyword', when: { if: true }, then: 'ALLOW' }],
    cases: [{ id: 'C-KEYWORD', input: { if: true }, expected: 'ALLOW' }],
  };

  const rego = generateDecisionRego('DEC-KEYWORD', keywordSpec);
  assert.match(rego, /input\["if"\] == true/);
  assert.doesNotMatch(rego, /input\.if/);
});
