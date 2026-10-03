#!/usr/bin/env node
import { Command, CommanderError, Option } from 'commander';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { packageRoot, services } from '../../bootstrap.js';
import { initialize } from '../../infrastructure/scaffold/init.js';
import { discover } from '../../infrastructure/filesystem/workspace.js';
import { migrateLegacy } from '../../infrastructure/legacy/migrate.js';
import { graph, mermaid } from '../../domain/graph.js';
import { IntentError } from '../../domain/model.js';
import { evaluateDecision, analyzeDecision } from '../../domain/decisions.js';
import type { DecisionSpec } from '../../domain/decisions.js';
import { conformDecision } from '../../application/decision-conformance.js';
import { ReferenceDecisionRuntime } from '../../infrastructure/reference/reference-decision-runtime.js';
import { OpaDecisionRuntime } from '../../infrastructure/opa/opa-decision-runtime.js';
const cli = new Command().name('prd').description('PRD as a Code').version('0.2.0-alpha.1')
  .option('-C, --root <directory>', 'product directory or a child directory', '.')
  .option('--json', 'machine-readable output').showHelpAfterError().showSuggestionAfterError().exitOverride();
cli.configureOutput({ writeErr: text => { if (!process.argv.includes('--json')) process.stderr.write(text); } });
const service = () => services(discover(cli.opts().root));
function out(data: unknown, human?: string) { process.stdout.write((cli.opts().json || human === undefined ? JSON.stringify(data, null, 2) : human) + '\n'); }
function finiteDepth(value: string) { if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10000) throw new IntentError('INVALID_DEPTH', 'Depth must be 1..10000.'); return Number(value); }
cli.command('init').description('Create the YAML/Gherkin product and optional Copilot kit without overwriting files').argument('[directory]', 'target directory', '.')
  .option('--name <name>', 'product name', 'Meu produto')
  .addOption(new Option('--ai <provider>').choices(['copilot', 'none']).default('copilot'))
  .addOption(new Option('--language <locale>').choices(['pt', 'en']).default('pt'))
  .addOption(new Option('--profile <profile>').choices(['product-as-code']).default('product-as-code'))
  .addOption(new Option('--behaviors <format>').choices(['gherkin']).default('gherkin'))
  .action((directory, options) => { const result = initialize(directory, packageRoot, options); out(result, `Criado: ${result.root}\n${result.files} arquivos; Copilot: ${result.ai}; idioma: ${result.language}\n\nPróximos passos:\n  prd -C ${JSON.stringify(result.root)} validate --strict\n  prd -C ${JSON.stringify(result.root)} test --require-tests\n  prd -C ${JSON.stringify(result.root)} graph --format mermaid`); });
cli.command('capabilities').description('Show implemented profiles and explicit limitations').action(() => out(JSON.parse(readFileSync(resolve(packageRoot, 'framework/capabilities.json'), 'utf8'))));
cli.command('validate').description('Validate schemas, references, types, finite decisions and process structure').option('--strict', 'fail on unsupported constructs and blocking questions').option('--citations', 'also verify native citations')
  .action(options => { const s = service(), r = s.validate(options.strict); const citations = options.citations && r.valid ? s.citations() : undefined; const valid = r.valid && (citations?.valid ?? true); out({ valid, artifacts: r.model.artifacts.length, scenarios: r.model.scenarios.length, diagnostics: r.model.diagnostics, citations }, `${valid ? '✓' : '✗'} ${r.model.artifacts.length} artefatos; ${r.model.scenarios.length} cenários\n${r.model.diagnostics.map(d => `${d.severity} ${d.code}: ${d.message} (${d.file ?? ''})`).join('\n')}${citations ? '\nCitações válidas: ' + citations.valid : ''}`.trim()); if (!valid) process.exitCode = 1; });
cli.command('list').description('List typed product artifacts').action(() => { const m = service().load(); out(m.artifacts.map(s => ({ id: s.artifact.metadata.id, kind: s.artifact.kind, title: s.artifact.metadata.title, digest: s.digest }))); });
cli.command('show').argument('<id>').description('Inspect canonical artifact and source').action(id => { const s = service().load().artifacts.find(s => s.artifact.metadata.id === id); if (!s) throw new IntentError('UNKNOWN_ID', id); out(s); });
for (const name of ['graph', 'trace', 'impact', 'context']) {
  const cmd = cli.command(name).description(name === 'context' ? 'Read-only subgraph and exact source artifacts for AI context' : 'Inspect relationship graph');
  if (name !== 'graph') cmd.argument('<id>');
  cmd.addOption(new Option('--format <format>').choices(['json', 'mermaid']).default('json'))
    .addOption(new Option('--direction <direction>').choices(['in', 'out', 'both']).default(name === 'impact' ? 'in' : 'both'))
    .option('--depth <n>', 'traversal distance', finiteDepth, name === 'trace' || name === 'context' ? 2 : 10000)
    .action((...args) => { const options = name === 'graph' ? args[0] : args[1], id = name === 'graph' ? undefined : args[0]; const m = service().load(); if (id && !m.artifacts.some(s => s.artifact.metadata.id === id) && !m.scenarios.some(s => s.id === id)) throw new IntentError('UNKNOWN_ID', id); const g = graph(m, id, options.direction, options.depth); if (name === 'context') { const ids = new Set(g.nodes.map(n => n.id)); out({ baseline: m.baseline, graph: g, artifacts: m.artifacts.filter(s => ids.has(s.artifact.metadata.id)), scenarios: m.scenarios.filter(s => ids.has(s.id)), diagnostics: m.diagnostics }); } else if (options.format === 'mermaid' && !cli.opts().json) out(g, mermaid(g)); else out(g); });
}
cli.command('test').description('Execute typed decision cases; report unbound Gherkin scenarios').option('--require-tests', 'fail when no cases are present').option('--require-bound-scenarios', 'fail when scenarios have no decision-case binding')
  .action(options => { const r = service().test(); const passed = r.passed && (!options.requireTests || r.tests.length > 0) && (!options.requireBoundScenarios || !r.unboundScenarios.length); out({ ...r, passed }); if (!passed) process.exitCode = 1; });
const decision = cli.command('decision').description('Evaluate supported decision tables');
decision.command('evaluate').argument('<id>').requiredOption('--input <json>', 'typed input object').action((id, opts) => { const a = service().load().artifacts.find(s => s.artifact.metadata.id === id && s.artifact.kind === 'Decision'); if (!a) throw new IntentError('UNKNOWN_DECISION', id); out(evaluateDecision(a.artifact.spec as unknown as DecisionSpec, JSON.parse(opts.input))); });
decision.command('analyze').argument('<id>').action(id => { const a = service().load().artifacts.find(s => s.artifact.metadata.id === id && s.artifact.kind === 'Decision'); if (!a) throw new IntentError('UNKNOWN_DECISION', id); const result = analyzeDecision(a.artifact.spec as unknown as DecisionSpec); out(result); if (result.status !== 'valid') process.exitCode = 1; });
const conformance = cli.command('conformance').description('Compare executable decision runtimes with PRD as a Code reference semantics');
conformance.command('decision').argument('<id>').addOption(new Option('--runtime <runtime>').choices(['reference', 'opa']).default('reference'))
  .action(async (id, opts) => {
    const a = service().load().artifacts.find(s => s.artifact.metadata.id === id && s.artifact.kind === 'Decision');
    if (!a) throw new IntentError('UNKNOWN_DECISION', id);
    const runtime = opts.runtime === 'opa' ? new OpaDecisionRuntime() : new ReferenceDecisionRuntime();
    const result = await conformDecision(id, a.artifact.spec as unknown as DecisionSpec, runtime);
    out(result, `${result.passed ? '✓' : '✗'} ${id} on ${result.runtime}: ${result.matched}/${result.cases.length} cases conform`);
    if (!result.passed) process.exitCode = 1;
  });
cli.command('cite').argument('<id>').option('--into <file.md>', 'append to supporting document').action((id, opts) => { const s = service(); if (opts.into) out(s.citeInto(id, opts.into)); else { const block = s.cite(id); out({ block }, block.trimEnd()); } });
const citations = cli.command('citations').description('Verify current/stale/tampered/unresolved native citations');
citations.command('check').action(() => { const r = service().citations(); out(r); if (!r.valid) process.exitCode = 1; });
citations.command('refresh').argument('<file.md>').action(file => out(service().refreshCitation(file)));
const changes = cli.command('change').description('Reviewable, baseline-checked change proposals');
changes.command('new').argument('<id>').requiredOption('--title <reason>').action((id, opts) => out(service().createChange(id, opts.title)));
changes.command('stage').argument('<id>').requiredOption('--target <path>', 'target file inside product directory').option('--file <draft>', 'source resolved from current shell directory').option('--delete', 'delete target').action((id, opts) => { if (Boolean(opts.file) === Boolean(opts.delete)) throw new IntentError('USAGE_ERROR', 'Choose exactly one of --file or --delete.'); out(service().stage(id, opts.target, opts.delete ? null : readFileSync(resolve(opts.file), 'utf8'))); });
changes.command('show').argument('<id>').action(id => out(service().readChange(id)));
changes.command('check').argument('<id>').action(id => { const s = service(), r = s.candidate(id), tests = s.testModel(r.model), valid = !r.model.diagnostics.some(d => d.severity !== 'warning') && tests.passed; out({ id, valid, tests, diagnostics: r.model.diagnostics, operations: r.change.operations.map(o => o.path) }); if (!valid) process.exitCode = 1; });
changes.command('diff').argument('<id>').action(id => { const s = service(), r = s.candidate(id); const diff = r.change.operations.map(o => ({ file: o.path, before: s.workspace.read(o.path), after: o.content })); out(diff, diff.map(d => `--- ${d.file}\n${d.before ?? '(new file)'}\n+++ proposed\n${d.after ?? '(deleted)'}`).join('\n')); });
changes.command('approve').argument('<id>').requiredOption('--by <reviewer>').action((id, opts) => out(service().approve(id, opts.by)));
changes.command('apply').argument('<id>').action(id => out(service().apply(id)));
changes.command('recover').action(() => out(service().recover()));
cli.command('migrate').description('Additively migrate this project’s old prodshape format; never rewrites historical digests').option('--dry-run').action(opts => out(migrateLegacy(resolve(cli.opts().root), packageRoot, Boolean(opts.dryRun))));
cli.command('legacy').description('Run the preserved v0 CLI against legacy files; no second global executable').argument('[args...]').allowUnknownOption().allowExcessArguments().action(args => { const result = spawnSync(process.execPath, [resolve(packageRoot, 'dist/legacy/v0/cli.js'), '--root', resolve(cli.opts().root), ...(cli.opts().json ? ['--json'] : []), ...args], { stdio: 'inherit' }); if (result.error) throw result.error; process.exitCode = result.status ?? 2; });
cli.addHelpText('after', '\nExit codes: 0 success; 1 checks failed; 2 usage/operation error.\nThis alpha implements explicit profiles, not full OMG conformance or a BPMN engine.\n');
process.stdout.on('error', e => { if ((e as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0); throw e; });
try { if (process.argv.length === 2) cli.outputHelp(); else await cli.parseAsync(); }
catch (e) {
  if (e instanceof CommanderError && ['commander.helpDisplayed', 'commander.version'].includes(e.code)) process.exitCode = 0;
  else { process.exitCode = 2; const error = { code: e instanceof IntentError ? e.code : e instanceof CommanderError ? 'USAGE_ERROR' : 'OPERATION_FAILED', message: (e as Error).message, details: e instanceof IntentError ? e.details : undefined }; if (cli.opts().json || process.argv.includes('--json')) process.stderr.write(JSON.stringify({ error }) + '\n'); else if (!(e instanceof CommanderError)) process.stderr.write(`Error [${error.code}]: ${error.message}\n${error.details ? JSON.stringify(error.details, null, 2) + '\n' : ''}`); }
}
