import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const binary = process.env.PRD_OPA_BINARY || 'opa';
const host = process.env.OPA_TEST_HOST || '127.0.0.1';
const port = Number(process.env.OPA_TEST_PORT || 8181);
const baseUrl = `http://${host}:${port}`;
const policyPath = fileURLToPath(new URL('../opa/policies', import.meta.url));
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
      const response = await fetch(`${baseUrl}/health?bundles`);
      if (response.ok) return;
    } catch {
      // The listener may not be ready yet.
    }
    await delay(100);
  }
  throw new Error(`OPA server did not become ready at ${baseUrl}.\n${output}`);
}

const cases = [
  {
    id: 'CASE-001',
    input: { contaAtiva: true, saldoSuficiente: true },
    expected: { value: 'ELEGIVEL', ruleId: 'DROW-003' },
  },
  {
    id: 'CASE-002',
    input: { contaAtiva: false, saldoSuficiente: true },
    expected: { value: 'CONTA_INATIVA', ruleId: 'DROW-001' },
  },
  {
    id: 'CASE-003',
    input: { contaAtiva: true, saldoSuficiente: false },
    expected: { value: 'SALDO_INSUFICIENTE', ruleId: 'DROW-002' },
  },
  {
    id: 'CASE-004',
    input: { contaAtiva: false, saldoSuficiente: false },
    expected: { value: 'CONTA_INATIVA', ruleId: 'DROW-001' },
  },
];

try {
  await waitUntilReady();
  for (const testCase of cases) {
    const response = await fetch(`${baseUrl}/v1/data/prd/decision/dec_001/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: testCase.input }),
    });
    assert.equal(response.status, 200, `${testCase.id}: unexpected HTTP status`);
    const document = await response.json();
    assert.deepEqual(document.result, testCase.expected, `${testCase.id}: divergent decision`);
  }
  process.stdout.write(`OPA server: ${cases.length} decision cases passed.\n`);
} finally {
  server.kill('SIGTERM');
  await Promise.race([
    new Promise(resolveExit => server.once('exit', resolveExit)),
    delay(2_000, undefined, { ref: false }).then(() => server.kill('SIGKILL')),
  ]);
}
