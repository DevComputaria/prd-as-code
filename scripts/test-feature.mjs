import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportDirectory = resolve(repositoryRoot, 'reports/features');
const ignored = new Set(['.git', 'node_modules', 'dist', 'reports']);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && entry.name.endsWith('.feature') ? [path] : [];
  });
}

function parseFeature(path) {
  const text = readFileSync(path, 'utf8');
  const parser = new Parser(
    new AstBuilder(IdGenerator.incrementing()),
    new GherkinClassicTokenMatcher(),
  );
  const document = parser.parse(text);
  if (!document.feature) throw new Error('Expected a Gherkin Feature/Funcionalidade.');
  const scenarios = [];
  const visit = (children, inherited) => {
    for (const child of children) {
      if (child.rule) visit(child.rule.children, [...inherited, ...child.rule.tags]);
      if (!child.scenario) continue;
      const tags = [...inherited, ...child.scenario.tags].map(tag => tag.name);
      const ids = tags.filter(tag => tag.startsWith('@scenario_'));
      const id = ids[0]?.slice('@scenario_'.length);
      const valid = ids.length === 1 && /^@scenario_SCN-[A-Za-z0-9][A-Za-z0-9-]*$/.test(ids[0]);
      scenarios.push({
        id: valid ? id : null,
        name: child.scenario.name,
        line: child.scenario.location.line,
        tags,
        steps: child.scenario.steps.map(step => step.text),
        error: valid
          ? null
          : `Scenario at line ${child.scenario.location.line} requires exactly one @scenario_SCN-... tag.`,
      });
    }
  };
  visit(document.feature.children, document.feature.tags);
  return {
    file: relative(repositoryRoot, path),
    name: document.feature.name,
    language: document.feature.language,
    tags: document.feature.tags.map(tag => tag.name),
    scenarios,
  };
}

const files = walk(repositoryRoot).map(path => {
  try {
    return { ok: true, ...parseFeature(path) };
  } catch (error) {
    return {
      ok: false,
      file: relative(repositoryRoot, path),
      error: error instanceof Error ? error.message : String(error),
      scenarios: [],
    };
  }
});

const productRoot = resolve(repositoryRoot, 'examples/transfer');
const cli = resolve(repositoryRoot, 'dist/interfaces/cli/main.js');
const bound = spawnSync(process.execPath, [
  cli,
  '-C',
  productRoot,
  '--json',
  'test',
  '--require-tests',
  '--require-bound-scenarios',
], { encoding: 'utf8', windowsHide: true });
let binding = null;
try {
  binding = JSON.parse(bound.stdout);
} catch {
  binding = {
    passed: false,
    error: (
      bound.error?.message ||
      bound.stderr ||
      bound.stdout ||
      'prd test did not return JSON'
    ).trim(),
  };
}

const scenarios = files.flatMap(file =>
  file.scenarios.map(scenario => ({ file: file.file, ...scenario })),
);
const tagErrors = scenarios.filter(scenario => scenario.error);
const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? null,
  scope: 'Gherkin parse, scenario identity and decision-case binding. Steps are not executed.',
  files: files.length,
  scenarios: scenarios.length,
  tagErrors: tagErrors.length,
  binding,
  features: files,
  passed: files.every(file => file.ok) && tagErrors.length === 0 &&
    binding?.passed === true && bound.status === 0,
};

mkdirSync(reportDirectory, { recursive: true });
writeFileSync(
  resolve(reportDirectory, 'features.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
const markdown = [
  '# Feature binding report',
  '',
  `- Files: ${report.files}`,
  `- Scenarios: ${report.scenarios}`,
  `- Tag errors: ${report.tagErrors}`,
  `- Bound test: ${binding?.passed ? 'passed' : 'failed'}`,
  `- Unbound: ${(binding?.unboundScenarios ?? []).join(', ') || 'none'}`,
  '',
  '| File | Scenario | Line | Error |',
  '| --- | --- | --- | --- |',
  ...scenarios.map(scenario =>
    `| ${scenario.file} | ${scenario.id ?? scenario.name} | ${scenario.line} | ${scenario.error ?? ''} |`,
  ),
  ...files.filter(file => !file.ok).map(file =>
    `| ${file.file} | — | — | ${file.error} |`,
  ),
  '',
  'Step definitions are out of scope. A green report means the feature parsed and every scenario id is bound to a decision case.',
  '',
].join('\n');
writeFileSync(resolve(reportDirectory, 'features.md'), markdown);
process.stdout.write(`Feature report: ${reportDirectory} (${report.passed ? 'passed' : 'failed'})\n`);
if (!report.passed) process.exit(1);
