import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { opaPackageName } from '../dist/infrastructure/opa/rego-generator.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportDirectory = resolve(repositoryRoot, 'reports/opa');
const productRoot = resolve(repositoryRoot, 'examples/transfer');
const decisionPath = resolve(productRoot, 'product/decisions/DEC-001.yaml');
const artifact = parse(readFileSync(decisionPath, 'utf8'));
const decisionId = artifact.metadata.id;
const packageName = opaPackageName(decisionId);
const policyPath = resolve(
  repositoryRoot,
  'opa/policies',
  `${packageName.split('.').at(-1)}.rego`,
);
const cli = resolve(repositoryRoot, 'dist/interfaces/cli/main.js');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

const version = run(['--version']);
const conformance = run([
  '-C',
  productRoot,
  '--json',
  'conformance',
  'decision',
  decisionId,
  '--runtime',
  'opa',
  '--parity',
  '--policy',
  policyPath,
]);

let document = null;
let parseError = null;
try {
  document = JSON.parse(conformance.stdout);
} catch (error) {
  parseError = error instanceof Error ? error.message : String(error);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? null,
  runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
  tool: (version.stdout || '').trim(),
  decision: decisionId,
  policy: policyPath.slice(repositoryRoot.length + 1),
  package: packageName,
  exitCode: conformance.status,
  parseError,
  conformance: document,
  stderr: (conformance.stderr || '').trim() || null,
};

mkdirSync(reportDirectory, { recursive: true });
writeFileSync(
  resolve(reportDirectory, 'conformance.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

const cases = document?.cases ?? [];
const rows = cases
  .map(item => {
    const error = item.runtimeError ?? item.referenceError ?? item.error ?? '';
    return `| ${item.id} | ${item.kind} | ${item.passed ? 'pass' : 'fail'} | ${error} |`;
  })
  .join('\n');
const markdown = [
  '# OPA conformance report',
  '',
  `- Decision: \`${decisionId}\``,
  `- Package: \`${packageName}\``,
  `- Policy: \`${report.policy}\``,
  `- Tool: ${report.tool || 'unknown'}`,
  `- Runtime: ${document?.runtime ?? 'opa'}${document?.runtimeVersion ? ` ${document.runtimeVersion}` : ''}`,
  `- Result: ${document?.passed ? 'passed' : 'failed'} (${document?.matched ?? 0}/${cases.length})`,
  `- Parity: ${document?.parity ? 'yes' : 'no'}`,
  `- Exit: ${conformance.status}`,
  '',
  '| Case | Kind | Result | Error |',
  '| --- | --- | --- | --- |',
  rows || '| — | — | — | report was not JSON |',
  '',
  'This report compares the reference decision evaluator with the OPA candidate. It does not execute Gherkin steps.',
  '',
].join('\n');
writeFileSync(resolve(reportDirectory, 'conformance.md'), markdown);

process.stdout.write(`OPA report: ${reportDirectory}\n`);
if (conformance.error && conformance.status === null) throw conformance.error;
if (conformance.status !== 0 || parseError) process.exit(conformance.status || 1);
