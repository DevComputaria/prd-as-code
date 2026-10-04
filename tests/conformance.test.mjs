import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conformDecision } from '../dist/application/decision-conformance.js';
import { ReferenceDecisionRuntime } from '../dist/infrastructure/reference/reference-decision-runtime.js';
import { OpaDecisionRuntime } from '../dist/infrastructure/opa/opa-decision-runtime.js';
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

test('conformance uses one batch for all declared cases when the runtime supports it', async () => {
  let batches = 0;
  const runtime = {
    name: 'batch',
    async evaluate() {
      throw new Error('single evaluation should not be used');
    },
    async evaluateBatch(requests) {
      batches += 1;
      return requests.map(request => ({
        ok: true,
        result: {
          value: request.input.active && request.input.funded ? 'ALLOW' : 'DENY',
          ruleId: request.input.active
            ? (request.input.funded ? 'allow' : 'unfunded')
            : 'inactive',
        },
      }));
    },
  };
  const result = await conformDecision('DEC-TEST', spec, runtime);
  assert.equal(result.passed, true);
  assert.equal(batches, 1);
});

test('OPA runtime rejects invalid input before invoking its binary', async () => {
  const runtime = new OpaDecisionRuntime('/definitely/missing/opa');
  await assert.rejects(
    runtime.evaluate({ decisionId: 'DEC-TEST', spec, input: { active: true } }),
    error => error?.code === 'INVALID_INPUT',
  );
});

test('OPA runtime terminates an evaluation that exceeds its timeout', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'prd-slow-opa-'));
  const binary = join(directory, 'opa');
  writeFileSync(binary, '#!/bin/sh\nsleep 2\n', { mode: 0o755 });
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const runtime = new OpaDecisionRuntime(binary, undefined, 25);
  await assert.rejects(
    runtime.evaluate({
      decisionId: 'DEC-TEST',
      spec,
      input: { active: true, funded: true },
    }),
    error => error?.code === 'OPA_EVAL_TIMEOUT',
  );
});

test('rego generator preserves decision ids, values and wildcard rows', () => {
  const rego = generateDecisionRego('DEC-TEST', spec);
  assert.equal(opaPackageName('DEC-TEST'), 'prd.decision.dec_test_c0429d8c0977');
  assert.match(rego, /package prd\.decision\.dec_test_c0429d8c0977/);
  assert.match(rego, /input\.active == true/);
  assert.match(rego, /"ruleId": "allow"/);
  assert.match(rego, /count\(matches\) == 1/);
  assert.match(rego, /valid_input if/);
  assert.match(rego, /evaluation := \{"status": "gap"/);
  assert.match(rego, /batch := \[outcome/);
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

test('rego package names distinguish ids with the same sanitized spelling', () => {
  assert.notEqual(opaPackageName('DEC-001'), opaPackageName('DEC_001'));
});

test('rego generator makes wildcard rows explicit', () => {
  const wildcardSpec = {
    ...spec,
    rules: [{ id: 'fallback', when: {}, then: 'DENY' }],
  };
  const rego = generateDecisionRego('DEC-WILDCARD', wildcardSpec);
  assert.match(rego, /# wildcard: this row has no input conditions\n\ttrue/);
});

test('reference conformance compares JSON-number edge cases canonically', async () => {
  const values = [0, -1, 1.25, 9007199254740994];
  const numericSpec = {
    profile: 'dmn-table/v1',
    hitPolicy: 'UNIQUE',
    inputs: [{ name: 'amount', type: 'number', values }],
    output: { name: 'result', type: 'number', values },
    rules: values.map((value, index) => ({
      id: `number-${index}`,
      when: { amount: value },
      then: value,
    })),
    cases: values.map((value, index) => ({
      id: `N-${index}`,
      input: { amount: value },
      expected: value,
    })),
  };
  const result = await conformDecision(
    'DEC-NUMBERS',
    numericSpec,
    new ReferenceDecisionRuntime(),
  );
  assert.equal(result.passed, true);
  assert.equal(result.matched, values.length);
});
