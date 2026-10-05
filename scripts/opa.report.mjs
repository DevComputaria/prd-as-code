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
const featurePath = resolve(productRoot, 'product/behaviors/transferencia.feature');
const decisionSource = readFileSync(decisionPath, 'utf8');
const featureSource = readFileSync(featurePath, 'utf8');
const artifact = parse(decisionSource);
const decisionId = artifact.metadata.id;
const packageName = opaPackageName(decisionId);
const policyPath = resolve(
  repositoryRoot,
  'opa/policies',
  `${packageName.split('.').at(-1)}.rego`,
);
const cli = resolve(repositoryRoot, 'dist/interfaces/cli/main.js');

const parityNotes = {
  'PARITY-EXTRA-INPUT': 'Chave extra no input. A referência rejeita o conjunto de chaves; o runtime deve devolver INVALID_INPUT antes de tratar a linha.',
  'PARITY-MISSING-INPUT': 'Chave declarada ausente. Não é coringa: falta de campo é contrato inválido, não regra faltante.',
  'PARITY-WRONG-TYPE': 'Tipo diferente do declarado. Igualdade do Rego não pode aceitar o que a referência recusa.',
  'PARITY-OUTSIDE-DOMAIN': 'Valor fora de values. O domínio do probe é reduzido ao valor do caso semente.',
  'PARITY-GAP': 'Tabela sem linhas. Prova DECISION_GAP no código de erro. Não prova buraco parcial numa tabela preenchida.',
  'PARITY-OVERLAP': 'A linha que casa com o caso semente é duplicada. UNIQUE não escolhe pela ordem.',
  'PARITY-INVALID-OUTPUT': 'then fora do domínio de saída. Os dois lados devem falhar com INVALID_DECISION_OUTPUT.',
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markedNotes(source, kind) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const notes = new Map();
  const marker = new RegExp(`^\\s*# ${kind} ([A-Za-z0-9-]+):\\s*(.+?)\\s*$`);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const match = lines[index].match(marker);
    if (!match) continue;
    const [, id, note] = match;
    const next = lines[index + 1];
    const adjacent = kind === 'decision'
      ? /^apiVersion:\s*\S+/.test(next)
      : kind === 'scenario'
        ? new RegExp(`^\\s*(?:@\\S+\\s+)*@scenario_${escapeRegExp(id)}(?:\\s+@\\S+)*\\s*$`).test(next)
        : new RegExp(`^\\s*- id:\\s*${escapeRegExp(id)}\\s*$`).test(next);
    if (adjacent) notes.set(id, note);
  }
  return notes;
}

function scalar(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

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

const decisionNotes = markedNotes(decisionSource, 'decision');
const ruleNotes = markedNotes(decisionSource, 'rule');
const caseNotes = markedNotes(decisionSource, 'case');
const scenarioNotes = markedNotes(featureSource, 'scenario');
const rules = artifact.spec.rules.map(rule => ({
  id: rule.id,
  when: Object.entries(rule.when).map(([name, value]) => `${name}=${scalar(value)}`).join(', ') || 'true',
  then: rule.then,
  note: ruleNotes.get(rule.id) ?? null,
}));
const scenarios = [...scenarioNotes].map(([id, note]) => ({ id, note }));
const cases = document?.cases ?? [];
const enrichedCases = cases.map(item => ({
  id: item.id,
  kind: item.kind,
  passed: item.passed,
  input: item.input,
  expected: item.expectedError ?? item.expected ?? null,
  observed: item.runtimeError ?? item.runtime?.value ?? null,
  note: item.kind === 'parity' ? parityNotes[item.id] ?? null : caseNotes.get(item.id) ?? null,
}));

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
  context: {
    decision: decisionNotes.get(decisionId) ?? null,
    rules,
    cases: enrichedCases,
    scenarios,
  },
  stderr: (conformance.stderr || '').trim() || null,
};

mkdirSync(reportDirectory, { recursive: true });
writeFileSync(
  resolve(reportDirectory, 'conformance.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

const ruleRows = rules
  .map(rule => `| ${rule.id} | ${markdownCell(rule.when)} | ${markdownCell(rule.then)} | ${markdownCell(rule.note)} |`)
  .join('\n');
const caseRows = enrichedCases
  .map(item => `| ${item.id} | ${item.kind} | ${item.passed ? 'pass' : 'fail'} | ${markdownCell(JSON.stringify(item.input))} | ${markdownCell(item.expected)} | ${markdownCell(item.observed)} | ${markdownCell(item.note)} |`)
  .join('\n');
const scenarioRows = scenarios.map(item => `- ${item.id}: ${item.note}`);
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
  '## Decisão',
  '',
  `- ${decisionNotes.get(decisionId) ?? 'Sem comentário estruturado.'}`,
  '',
  '## Regras',
  '',
  'Comentários `# rule ID:` do YAML. Célula omitida é coringa, não ausência de input.',
  '',
  '| Rule | When | Then | Nota |',
  '| --- | --- | --- | --- |',
  ruleRows || '| — | — | — | sem regras |',
  '',
  '## Casos',
  '',
  'Comentários `# case ID:` e `# scenario ID:`. Na paridade, a coluna observado é o código esperado, não uma falha.',
  '',
  '| Case | Kind | Result | Input | Esperado | Observado | Nota |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  caseRows || '| — | — | — | — | — | — | report was not JSON |',
  '',
  '## Cenários',
  '',
  ...(scenarioRows.length ? scenarioRows : ['- Sem comentários estruturados.']),
  '',
  'A comparação é entre evaluateDecision e o candidato OPA. O relatório não executa passos Gherkin.',
  '',
].join('\n');
writeFileSync(resolve(reportDirectory, 'conformance.md'), markdown);

process.stdout.write(`OPA report: ${reportDirectory}\n`);
if (conformance.error && conformance.status === null) throw conformance.error;
if (conformance.status !== 0 || parseError) process.exit(conformance.status || 1);
