import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parse } from 'yaml';
import { evaluateDecision } from '../dist/domain/decisions.js';
import { opaPackageName } from '../dist/infrastructure/opa/rego-generator.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binary = process.env.PRD_OPA_BINARY || 'opa';
const host = process.env.OPA_TEST_HOST || '127.0.0.1';
const artifactPath = resolve(
  repositoryRoot,
  process.env.OPA_TEST_DECISION || 'examples/transfer/product/decisions/DEC-001.yaml',
);
const artifact = parse(readFileSync(artifactPath, 'utf8'));
if (artifact?.kind !== 'Decision' || typeof artifact.metadata?.id !== 'string' || !artifact.spec) {
  throw new Error(`${artifactPath} is not a Decision artifact.`);
}

async function reservePort() {
  const listener = createServer();
  await new Promise((resolveListen, reject) => {
    listener.once('error', reject);
    listener.listen(0, host, resolveListen);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve an OPA test port.');
  await new Promise((resolveClose, reject) => listener.close(error => error ? reject(error) : resolveClose()));
  return address.port;
}

const port = Number(process.env.OPA_TEST_PORT || await reservePort());
const baseUrl = `http://${host}:${port}`;
const packageName = opaPackageName(artifact.metadata.id);
const policyPath = resolve(repositoryRoot, 'opa/policies', `${packageName.split('.').at(-1)}.rego`);
const decisionUrl = `${baseUrl}/v1/data/${packageName.replaceAll('.', '/')}/result`;
const server = spawn(binary, ['run', '--server', `--addr=${host}:${port}`, policyPath], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
server.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });

async function waitUntilReady() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`OPA server stopped unexpectedly.\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The listener may not be ready yet.
    }
    await delay(100);
  }
  throw new Error(`OPA server did not become ready at ${baseUrl}.\n${output}`);
}

try {
  await Promise.race([
    waitUntilReady(),
    new Promise((_, reject) => server.once('error', reject)),
  ]);
  for (const testCase of artifact.spec.cases) {
    const expected = evaluateDecision(artifact.spec, testCase.input);
    const response = await fetch(decisionUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: testCase.input }),
    });
    assert.equal(response.status, 200, `${testCase.id}: unexpected HTTP status`);
    const document = await response.json();
    assert.deepEqual(document.result, expected, `${testCase.id}: divergent decision`);
  }
  process.stdout.write(
    `OPA server ${packageName}: ${artifact.spec.cases.length} generated decision cases passed.\n`,
  );
} finally {
  if (server.pid && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise(resolveExit => server.once('exit', resolveExit)),
      delay(2_000, undefined, { ref: false }).then(() => server.kill('SIGKILL')),
    ]);
  }
}
