import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { conformDecision } from '../dist/application/decision-conformance.js';
import { OpaDecisionRuntime } from '../dist/infrastructure/opa/opa-decision-runtime.js';
import { opaPackageName } from '../dist/infrastructure/opa/rego-generator.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(
  repositoryRoot,
  'examples/transfer/product/decisions/DEC-001.yaml',
);
const artifact = parse(readFileSync(artifactPath, 'utf8'));
const packageName = opaPackageName(artifact.metadata.id);
const policyPath = resolve(
  repositoryRoot,
  'opa/policies',
  `${packageName.split('.').at(-1)}.rego`,
);
const result = spawnSync(
  process.execPath,
  [
    resolve(repositoryRoot, 'dist/interfaces/cli/main.js'),
    '-C',
    resolve(repositoryRoot, 'examples/transfer'),
    'conformance',
    'decision',
    artifact.metadata.id,
    '--runtime',
    'opa',
    '--parity',
    '--policy',
    policyPath,
  ],
  { stdio: 'inherit', windowsHide: true },
);

if (result.error && result.status === null) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 2);

const numericValues = [0, -1, 1.25, 9007199254740994];
const numericSpec = {
  profile: 'dmn-table/v1',
  hitPolicy: 'UNIQUE',
  inputs: [{ name: 'amount', type: 'number', values: numericValues }],
  output: { name: 'result', type: 'number', values: numericValues },
  rules: numericValues.map((value, index) => ({
    id: `number-${index}`,
    when: { amount: value },
    then: value,
  })),
  cases: numericValues.map((value, index) => ({
    id: `N-${index}`,
    input: { amount: value },
    expected: value,
  })),
};
const quotedSpec = {
  profile: 'dmn-table/v1',
  hitPolicy: 'UNIQUE',
  inputs: [{ name: 'message', type: 'string' }],
  output: { name: 'result', type: 'string' },
  rules: [{ id: 'quoted', when: { message: 'say "hello"' }, then: 'answer "ok"' }],
  cases: [{ id: 'QUOTED-1', input: { message: 'say "hello"' }, expected: 'answer "ok"' }],
};

for (const [decisionId, spec] of [
  ['DEC-NUMBERS', numericSpec],
  ['DEC-QUOTED', quotedSpec],
]) {
  const conformance = await conformDecision(decisionId, spec, new OpaDecisionRuntime());
  assert.equal(conformance.passed, true, `${decisionId}: OPA diverged from reference semantics`);
  process.stdout.write(
    `${decisionId} on OPA ${conformance.runtimeVersion}: ${conformance.matched}/${conformance.cases.length} cases conform\n`,
  );
}
