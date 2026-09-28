#!/usr/bin/env node
import { Command, Option, CommanderError, InvalidArgumentError } from 'commander';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { atomicWrite, exclusiveWrite, findRoot, inside, read, withLock } from './fs.js';
import { buildGraph, connected, getItem, ID_RE, loadProduct, mermaid, parseItem, requireValid, serialize, validateItems } from './model.js';
import { citation, saveSnapshot, verifyFiles, verifyText } from './citations.js';
import { applyChange, approveChange, assertNoPending, checkChange, createChange, readChange, recoverChange, stage } from './changes.js';
import { init, nextId, template } from './scaffold.js';
import { ProdshapeError, TYPES } from './types.js';
import type { CitationResult, Graph, ItemType, Product } from './types.js';

const program = new Command();
program.name('prodshape').description('Shape product intent in Markdown. Trace relationships, review changes, and verify citations.')
  .version('0.1.0').option('-C, --root <directory>', 'product directory (also searches parents)', '.')
  .option('--json', 'emit machine-readable JSON').option('--debug', 'show unexpected error stacks')
  .showHelpAfterError('(Use --help for command usage.)').showSuggestionAfterError().exitOverride();
program.configureOutput({ writeErr: text => { if (!program.opts().json && !process.argv.includes('--json')) process.stderr.write(text); } });

function output(value: unknown, human: string): void {
  process.stdout.write((program.opts().json ? JSON.stringify(value, null, 2) : human) + '\n');
}
function root(): string { return findRoot(program.opts().root); }
function product(valid = true): Product {
  const path = root(); assertNoPending(path);
  const p = loadProduct(path); if (valid) requireValid(p); return p;
}
function mutate<T>(fn: (p: Product) => T): T {
  const path = root();
  return withLock(path, () => { assertNoPending(path); return fn(loadProduct(path)); });
}
function depth(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10000) throw new InvalidArgumentError('Depth must be an integer from 1 to 10000.');
  return Number(value);
}
function renderGraph(g: Graph, format: string): void {
  if (program.opts().json || format === 'json') process.stdout.write(JSON.stringify(g, null, 2) + '\n');
  else if (format === 'mermaid') process.stdout.write(mermaid(g) + '\n');
  else output(g, `${g.nodes.length} item(s), ${g.edges.length} relationship(s)\n\n${g.nodes.map(n => `${n.id.padEnd(12)} ${n.title}`).join('\n')}\n\n${g.edges.map(e => `${e.from} ── ${e.relation} ──▶ ${e.to}`).join('\n')}`.trim());
}
function citationReport(results: CitationResult[]): void {
  const summary = { current: 0, stale: 0, tampered: 0, unresolved: 0 };
  for (const r of results) summary[r.status]++;
  output({ summary, citations: results }, results.length ? `${results.map(r => `${r.status.toUpperCase().padEnd(10)} ${r.file}:${r.line} ${r.id ?? '(invalid pin)'}\n           ${r.reason}`).join('\n')}\n\n${Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(' · ')}` : 'No citations found. Use "prodshape cite <ID> --into <file.md>" to add one.');
  if (results.some(r => r.status !== 'current')) process.exitCode = 1;
}
function markdownTarget(p: Product, file: string): string {
  if (!file.toLowerCase().endsWith('.md') || file.split(/[\\/]/).some(part => ['.prodshape', '.git', 'node_modules', 'dist'].includes(part))) throw new ProdshapeError('Citation targets must be Markdown files outside reserved directories.', 'INVALID_TARGET');
  const target = inside(p.root, file);
  const docs = inside(p.root, p.config.docs);
  if (target === docs || target.startsWith(docs + '/') || target.startsWith(docs + '\\')) throw new ProdshapeError('Citations belong in supporting docs outside the product directory; use [[ID]] for product-to-product links.', 'INVALID_TARGET');
  return target;
}

program.command('init').description('Create a complete example product in a new or empty directory')
  .argument('<directory>').option('-n, --name <name>', 'product name')
  .action((directory: string, opts) => {
    const path = init(directory, opts.name ?? basename(resolve(directory)));
    output({ root: path, created: 7 }, `Created product at ${path}\n\nNext:\n  cd ${JSON.stringify(path)}\n  prodshape validate\n  prodshape list\n  prodshape trace BR-001 --direction in --depth 3`);
  });
program.command('add').description('Scaffold a draft item directly (use change stage for reviewed additions)')
  .argument('<type>', TYPES.join(', ')).argument('<title>').option('--id <id>', 'explicit ID; otherwise allocate the next ID')
  .action((type: string, title: string, opts) => {
    if (!TYPES.includes(type as ItemType)) throw new ProdshapeError(`Unknown type ${type}. Choose: ${TYPES.join(', ')}.`, 'INVALID_TYPE');
    const result = mutate(p => {
      requireValid(p);
      const id = opts.id ?? nextId(type as ItemType, p.items.map(i => i.meta.id));
      if (!ID_RE.test(id)) throw new ProdshapeError('ID must look like REQ-002.', 'INVALID_ID');
      const data = template(type as ItemType, id, title), content = serialize(data.meta, data.body);
      const file = `${p.config.docs}/${type}/${id}.md`, item = parseItem(content, file);
      const issues = validateItems([...p.items, item]);
      if (issues.length) throw new ProdshapeError('Cannot add item.', 'VALIDATION_FAILED', issues);
      const target = inside(p.root, file);
      if (existsSync(target)) throw new ProdshapeError(`File already exists: ${file}`, 'FILE_EXISTS');
      saveSnapshot(p.root, item); exclusiveWrite(target, content); return { id, file };
    });
    output(result, `Created ${result.id} → ${result.file}\nEdit the Markdown, then run prodshape validate.`);
  });
program.command('list').description('List product IDs, types, status, and titles')
  .addOption(new Option('--type <type>', 'filter item type').choices([...TYPES]))
  .action(opts => {
    const items = product().items.filter(i => !opts.type || i.meta.type === opts.type).map(i => ({ ...i.meta, file: i.file, digest: i.digest }));
    output(items, items.map(i => `${i.id.padEnd(12)} ${i.type.padEnd(12)} ${i.status.padEnd(11)} ${i.title}`).join('\n') || 'No matching items.');
  });
program.command('show').description('Inspect a product item and its canonical content digest').argument('<id>')
  .action((id: string) => { const item = getItem(product(), id); output(item, `${item.meta.id} · ${item.meta.title}\n${item.file}\n${item.digest}\n\n${serialize(item.meta, item.body)}`); });
program.command('validate').description('Validate schema, IDs, relationships, and dependency cycles')
  .option('--citations', 'also require all supporting-doc citations to be current')
  .action(opts => {
    const p = product(false), citations = opts.citations && !p.issues.length ? verifyFiles(p) : [];
    const bad = citations.filter(c => c.status !== 'current');
    const valid = !p.issues.length && !bad.length;
    output({ valid, items: p.items.length, issues: p.issues, citations }, valid ? `✓ ${p.items.length} product items validated${opts.citations ? `; ${citations.length} citations current` : ''}.` : [...p.issues.map(i => `✗ ${i.code} ${i.file ?? ''}\n  ${i.message}`), ...bad.map(c => `✗ ${c.status.toUpperCase()} ${c.file}:${c.line} ${c.id ?? ''}\n  ${c.reason}`)].join('\n'));
    if (!valid) process.exitCode = 1;
  });
program.command('graph').description('Build a deterministic directed relationship graph')
  .addOption(new Option('--format <format>', 'output format').choices(['text', 'json', 'mermaid']).default('text'))
  .action(opts => renderGraph(buildGraph(product().items), opts.format));
program.command('trace').description('Show connections to an item, traversing incoming, outgoing, or both directions')
  .argument('<id>').addOption(new Option('--direction <direction>').choices(['in', 'out', 'both']).default('both'))
  .option('--depth <n>', 'maximum traversal distance', depth, 1)
  .addOption(new Option('--format <format>').choices(['text', 'json', 'mermaid']).default('text'))
  .action((id: string, opts) => { const p = product(); getItem(p, id); renderGraph(connected(p.items, id, opts.direction, opts.depth), opts.format); });
program.command('impact').description('Show all transitive incoming dependents of an item').argument('<id>')
  .addOption(new Option('--format <format>').choices(['text', 'json', 'mermaid']).default('text'))
  .action((id: string, opts) => { const p = product(); getItem(p, id); renderGraph(connected(p.items, id, 'in', p.items.length), opts.format); });
program.command('cite').description('Pin an item by ID + SHA-256 and preserve a content snapshot')
  .argument('<id>').option('--into <file.md>', 'append a verified quotation to a supporting document')
  .action((id: string, opts) => {
    const result = mutate(p => {
      requireValid(p); const item = getItem(p, id);
      const target = opts.into ? markdownTarget(p, opts.into) : undefined;
      const block = citation(p.root, item);
      if (target) atomicWrite(target, (existsSync(target) ? read(target).trimEnd() + '\n\n' : '') + block);
      return { id, digest: item.digest, file: opts.into ?? null, block };
    });
    output(result, opts.into ? `Pinned ${id} in ${opts.into}\n${result.digest}` : result.block.trimEnd());
  });
const citations = program.command('citations').description('Check or deliberately refresh pinned quotations');
citations.command('check').description('Classify citations as current, stale, tampered, or unresolved')
  .argument('[files...]', 'Markdown files relative to product root; default: all project Markdown')
  .action((files: string[]) => citationReport(verifyFiles(product(), files)));
citations.command('refresh').description('Explicitly replace intact citations with current source content; rejects tampered/unresolved pins')
  .argument('<file.md>').option('--id <id>', 'refresh only this item')
  .action((file: string, opts) => {
    const result = mutate(p => {
      requireValid(p); const path = markdownTarget(p, file), text = read(path);
      const matches = verifyText(p, text, file).filter(c => !opts.id || c.id === opts.id);
      if (!matches.length) throw new ProdshapeError('No matching citations found in this file.', 'NO_CITATIONS');
      if (matches.some(c => c.status === 'tampered' || c.status === 'unresolved')) throw new ProdshapeError('Cannot refresh tampered or unresolved citations. Inspect the evidence and explicitly replace the block with a new citation if appropriate.', 'UNSAFE_REFRESH', matches);
      const lines = text.replace(/\r\n?/g, '\n').split('\n');
      for (const c of [...matches].reverse()) {
        const end = lines.indexOf('<!-- /prodshape:cite -->', c.line);
        lines.splice(c.line - 1, end - c.line + 2, ...citation(p.root, getItem(p, c.id!)).trimEnd().split('\n'));
      }
      atomicWrite(path, lines.join('\n')); return { file, refreshed: matches.length };
    });
    output(result, `Refreshed ${result.refreshed} citation(s) in ${file}. Review and commit the diff.`);
  });

const changes = program.command('change').description('Stage, review, approve, and apply a product change set');
changes.command('new').description('Capture the current product baseline for a proposal').argument('<change-id>').requiredOption('--title <title>', 'reason for changing the product')
  .action((id: string, opts) => { const c = mutate(p => createChange(p, id, opts.title)); output(c, `Created proposal ${id}. Stage edited copies with:\n  prodshape change stage ${id} --file <draft.md>`); });
changes.command('stage').description('Stage an edited/new Markdown file or an item removal; invalidates prior approval').argument('<change-id>')
  .option('--file <path>', 'edited Markdown file, resolved from current working directory').option('--remove <id>', 'item ID to delete')
  .action((id: string, opts) => {
    if (Boolean(opts.file) === Boolean(opts.remove)) throw new ProdshapeError('Provide exactly one of --file or --remove.', 'INVALID_ARGUMENT');
    const content = opts.file ? read(resolve(opts.file)) : null;
    const c = mutate(p => stage(p, id, content, opts.remove)); output(c, `Staged ${c.operations.length} operation(s) in ${id}. Status: draft.\nNext: prodshape change check ${id}`);
  });
changes.command('show').description('Display the proposal, including exact staged content').argument('<change-id>')
  .action((id: string) => { const c = readChange(root(), id); output(c, `${c.id}: ${c.title}\nStatus: ${c.status}\nBaseline: ${c.base}\n${c.approval ? `Approved by: ${c.approval.by}\n` : ''}\n${c.operations.map(o => `--- ${o.file} (${o.content === null ? 'remove' : 'write'}) ---\n${o.content ?? '(deleted)'}`).join('\n')}`); });
changes.command('check').description('Validate the proposed product and show impacted IDs without changing product files').argument('<change-id>')
  .action((id: string) => { const report = checkChange(product(), id); output(report, `${report.valid ? '✓' : '✗'} Proposal ${id}: ${report.operations.length} operation(s)\n${report.operations.map(o => `  ${o.action.padEnd(7)} ${o.id} → ${o.file}`).join('\n')}\nImpacted: ${report.impacted.join(', ')}\n${report.issues.map(i => `${i.code}: ${i.message}`).join('\n')}`.trim()); if (!report.valid) process.exitCode = 1; });
changes.command('diff').description('Show the exact before/after Markdown as unified diff').argument('<change-id>')
  .action((id: string) => {
    const p = product(), c = readChange(p.root, id); checkChange(p, id);
    const diffs = c.operations.map(op => {
      const previous = p.items.find(i => i.meta.id === op.id);
      const before = previous ? read(inside(p.root, previous.file)) : '';
      const after = op.content ?? '';
      const lines = (s: string): string[] => s ? s.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n') : [];
      const a = lines(before), b = lines(after);
      let first = 0, suffix = 0;
      while (first < Math.min(a.length, b.length) && a[first] === b[first]) first++;
      while (suffix < Math.min(a.length, b.length) - first && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
      const start = Math.max(0, first - 3), endA = Math.min(a.length, a.length - suffix + 3), endB = Math.min(b.length, b.length - suffix + 3);
      const diff = before === after ? `(unchanged) ${op.file}` : [
        `--- ${previous ? `a/${op.file}` : '/dev/null'}`, `+++ ${op.content === null ? '/dev/null' : `b/${op.file}`}`,
        `@@ -${a.length ? start + 1 : 0},${endA - start} +${b.length ? start + 1 : 0},${endB - start} @@`,
        ...a.slice(start, first).map(l => ` ${l}`), ...a.slice(first, a.length - suffix).map(l => `-${l}`),
        ...b.slice(first, b.length - suffix).map(l => `+${l}`), ...a.slice(a.length - suffix, endA).map(l => ` ${l}`),
      ].join('\n');
      return { file: op.file, before, after: op.content, diff };
    });
    output({ change: id, diffs }, diffs.map(d => d.diff).join('\n\n'));
  });
changes.command('approve').description('Record review of the exact validated proposal (local audit record, not authentication)').argument('<change-id>').requiredOption('--by <reviewer>', 'reviewer name or handle')
  .action((id: string, opts) => { const c = mutate(p => approveChange(p, id, opts.by)); output(c, `Approved ${id} by ${opts.by}.\nProposal digest: ${c.approval!.digest}\nApply with: prodshape change apply ${id}`); });
changes.command('apply').description('Apply only an approved proposal against its unchanged baseline; journal writes for recovery').argument('<change-id>')
  .action((id: string) => { const c = mutate(p => applyChange(p, id)); output(c, `Applied ${id}: ${c.operations.length} operation(s).\nRun prodshape citations check, review the Git diff, and commit the product plus .prodshape/.`); });
changes.command('recover').description('Roll back an interrupted apply; refuses to overwrite unrelated edits')
  .action(() => { const path = root(), result = withLock(path, () => recoverChange(path)); output(result, `Rolled back ${result.recovered}. The proposal remains approved for review or retry.`); });

program.addHelpText('after', `\nQuick start:\n  $ prodshape init storefront --name "Storefront"\n  $ cd storefront\n  $ prodshape validate\n  $ prodshape impact BR-001\n  $ prodshape cite BR-001 --into notes/design.md\n  $ prodshape citations check\n\nExit codes: 0 success · 1 validation/citation failure · 2 usage/operation error\nAll commands support --json. Product commands discover prodshape.json in parent directories.\n`);
process.stdout.on('error', error => { if ((error as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0); throw error; });
try { await program.parseAsync(); }
catch (error) {
  if (error instanceof CommanderError) {
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') process.exitCode = 0;
    else { process.exitCode = 2; if (program.opts().json || process.argv.includes('--json')) process.stderr.write(JSON.stringify({ error: { code: 'USAGE_ERROR', message: error.message } }) + '\n'); }
  } else {
    process.exitCode = 2;
    const err = error as NodeJS.ErrnoException;
    const message = err.code === 'ENOENT' ? `File or directory not found: ${err.path ?? err.message}` : err.code === 'EACCES' ? `Permission denied: ${err.path ?? err.message}` : err.message;
    const value = { error: { code: error instanceof ProdshapeError ? error.code : err.code ?? 'OPERATION_FAILED', message, ...(error instanceof ProdshapeError && error.details ? { details: error.details } : {}) } };
    process.stderr.write(program.opts().json || process.argv.includes('--json') ? JSON.stringify(value, null, 2) + '\n' : `Error [${value.error.code}]: ${message}\n`);
    if (program.opts().debug) process.stderr.write(err.stack + '\n');
  }
}
