import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { init, loadProduct, parseItem, serialize, validateItems, buildGraph, connected, canonical, hash, citation, verifyText, snapshotPath, createChange, stage, checkChange, approveChange, applyChange, readChange, changeDigest, recoverChange, template, withLock } from '../dist/legacy/v0/index.js';

const cli = resolve('dist/legacy/v0/cli.js');
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'prodshape-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  init(dir, 'Storefront'); return dir;
}
function rule(root) { return loadProduct(root).items.find(i => i.meta.id === 'BR-001'); }
function revised(root) { const item = rule(root); return serialize(item.meta, item.body.replace('greater than zero', 'at least one cent')); }
function command(root, ...args) { return spawnSync(process.execPath, [cli, '--root', root, ...args], { encoding: 'utf8' }); }
function proposal(root) { createChange(loadProduct(root), 'minimum', 'Set minimum total'); stage(loadProduct(root), 'minimum', revised(root)); }

test('scaffold contains all seven types and a valid connected graph', t => {
  const root = fixture(t), p = loadProduct(root);
  assert.deepEqual(p.issues, []); assert.equal(p.items.length, 7);
  assert.equal(new Set(p.items.map(i => i.meta.type)).size, 7);
  assert.equal(buildGraph(p.items).edges.length, 9);
});
test('digests ignore YAML key order, CRLF, defaults and outer blank lines', () => {
  const a = parseItem('---\nid: BR-001\ntype: rule\ntitle: Rule\n---\n\nA rule.\n', 'a.md');
  const b = parseItem('---\r\ntitle: Rule\r\ntype: rule\r\nid: BR-001\r\nrelations: {}\r\nstatus: draft\r\n---\r\nA rule.\r\n\r\n', 'b.md');
  assert.equal(a.digest, b.digest);
  assert.notEqual(a.digest, parseItem(serialize(a.meta, 'A changed rule.'), 'c.md').digest);
  assert.equal(hash(canonical(a)), a.digest);
});
test('strict schema rejects unknown fields, duplicate YAML keys, wrong prefixes, aliases and incomplete behaviors', () => {
  for (const text of [
    'id: BR-001\ntype: rule\ntitle: Test\nstatuz: active',
    'id: BR-001\nid: BR-002\ntype: rule\ntitle: Test',
    'id: ACT-001\ntype: rule\ntitle: Test',
    'id: BR-001\ntype: rule\ntitle: &x Test\nstatus: *x',
    'id: BEH-001\ntype: behavior\ntitle: Test\nbehavior:\n  given: []',
  ]) assert.throws(() => parseItem(`---\n${text}\n---\nBody`, 'bad.md'), /bad.md/);
});
test('validation finds duplicates, missing targets, target type errors and dependency cycles', t => {
  const p = loadProduct(fixture(t)), r = p.items.find(i => i.meta.id === 'BR-001');
  assert.ok(validateItems([...p.items, r]).some(i => i.code === 'DUPLICATE_ID'));
  r.meta.relations = { 'governed-by': ['ACT-001'], 'depends-on': ['REQ-001'], uses: ['REQ-999'] };
  p.items.find(i => i.meta.id === 'REQ-001').meta.relations['depends-on'] = ['BR-001'];
  const codes = validateItems(p.items).map(i => i.code);
  for (const code of ['INVALID_RELATION', 'UNRESOLVED_REFERENCE', 'DEPENDENCY_CYCLE']) assert.ok(codes.includes(code));
});
test('wiki links create edges, code samples and citation blocks do not', t => {
  const p = loadProduct(fixture(t)), r = p.items.find(i => i.meta.id === 'BR-001');
  r.body += '\n[[REQ-001|Requirement]]\n`[[REQ-999]]`\n```md\n[[REQ-888]]\n```\n~~~md\n[[REQ-777]]\n~~~';
  const refs = buildGraph(p.items).edges.filter(e => e.from === 'BR-001' && e.relation === 'references');
  assert.deepEqual(refs.map(e => e.to), ['REQ-001']);
});
test('incoming trace and transitive impact follow the graph in the correct direction', t => {
  const p = loadProduct(fixture(t));
  const one = connected(p.items, 'BR-001', 'in', 1).nodes.map(n => n.id);
  const all = connected(p.items, 'BR-001', 'in', 7).nodes.map(n => n.id);
  assert.ok(one.includes('REQ-001')); assert.ok(!one.includes('JRN-001')); assert.ok(all.includes('JRN-001'));
  assert.deepEqual(connected(p.items, 'BR-001', 'out', 1).nodes.map(n => n.id), ['BR-001', 'TERM-001']);
});
test('citations classify current, stale, tampered and unresolved', t => {
  const root = fixture(t), old = rule(root), block = citation(root, old);
  assert.equal(verifyText(loadProduct(root), block, 'notes.md')[0].status, 'current');
  writeFileSync(join(root, old.file), revised(root));
  assert.equal(verifyText(loadProduct(root), block, 'notes.md')[0].status, 'stale');
  assert.equal(verifyText(loadProduct(root), block.replace('must be', 'may be'), 'notes.md')[0].status, 'tampered');
  const missing = { ...loadProduct(root), items: [] };
  assert.equal(verifyText(missing, block, 'notes.md')[0].status, 'unresolved');
  rmSync(snapshotPath(root, old.digest));
  assert.equal(verifyText(loadProduct(root), block, 'notes.md')[0].status, 'unresolved');
});
test('current citation can verify without an archive; corrupt archive is tampered', t => {
  const root = fixture(t), r = rule(root), block = citation(root, r), path = snapshotPath(root, r.digest);
  rmSync(path);
  assert.equal(verifyText(loadProduct(root), block, 'notes.md')[0].status, 'current');
  writeFileSync(path, '{}');
  assert.equal(verifyText(loadProduct(root), block, 'notes.md')[0].status, 'tampered');
});
test('malformed, orphaned, and truncated citation markers are reported; fenced examples are ignored', t => {
  const root = fixture(t), p = loadProduct(root), block = citation(root, rule(root));
  assert.deepEqual(verifyText(p, `\`\`\`md\n${block}\`\`\``, 'example.md'), []);
  for (const malformed of ['<!-- prodshape:cite bad -->', '<!-- /prodshape:cite -->', block.replace('<!-- /prodshape:cite -->', '')]) assert.equal(verifyText(p, malformed, 'bad.md')[0].status, 'tampered');
});
test('quoted literal citation marker text is not parsed as a nested citation', t => {
  const root = fixture(t), r = rule(root);
  r.body += '\n<!-- prodshape:cite literal -->';
  r.digest = hash(canonical(r));
  const block = citation(root, r), p = loadProduct(root); p.items = p.items.map(i => i.meta.id === r.meta.id ? r : i);
  assert.equal(verifyText(p, block, 'notes.md')[0].status, 'current');
});
test('stage does not change product; approval and apply preserve stale citation evidence', t => {
  const root = fixture(t), before = rule(root), block = citation(root, before); proposal(root);
  assert.equal(rule(root).digest, before.digest);
  const report = checkChange(loadProduct(root), 'minimum');
  assert.equal(report.valid, true); assert.ok(report.impacted.includes('BEH-001'));
  assert.throws(() => applyChange(loadProduct(root), 'minimum'), /approved/);
  approveChange(loadProduct(root), 'minimum', 'reviewer');
  assert.equal(applyChange(loadProduct(root), 'minimum').status, 'applied');
  assert.notEqual(rule(root).digest, before.digest);
  assert.equal(verifyText(loadProduct(root), block, 'notes.md')[0].status, 'stale');
  assert.ok(!existsSync(join(root, '.prodshape/pending.json')));
});
test('baseline conflicts prevent applying an approved proposal', t => {
  const root = fixture(t); proposal(root); approveChange(loadProduct(root), 'minimum', 'reviewer');
  const p = loadProduct(root), actor = p.items.find(i => i.meta.id === 'ACT-001');
  writeFileSync(join(root, actor.file), serialize(actor.meta, actor.body + '\nNew actor scope.'));
  assert.throws(() => applyChange(loadProduct(root), 'minimum'), /changed since/);
});
test('editing or restaging approved content invalidates approval', t => {
  const root = fixture(t); proposal(root); approveChange(loadProduct(root), 'minimum', 'reviewer');
  const path = join(root, '.prodshape/changes/minimum.json'), c = readChange(root, 'minimum');
  c.operations[0].content += '\nExtra content.\n'; writeFileSync(path, JSON.stringify(c));
  assert.throws(() => applyChange(loadProduct(root), 'minimum'), /approved/);
  stage(loadProduct(root), 'minimum', revised(root));
  assert.equal(readChange(root, 'minimum').status, 'draft'); assert.equal(readChange(root, 'minimum').approval, undefined);
});
test('deletion cannot leave dangling references; valid batch additions and removals apply', t => {
  const root = fixture(t); createChange(loadProduct(root), 'remove-rule', 'Remove rule'); stage(loadProduct(root), 'remove-rule', null, 'BR-001');
  assert.equal(checkChange(loadProduct(root), 'remove-rule').valid, false);
  assert.throws(() => approveChange(loadProduct(root), 'remove-rule', 'reviewer'), /validation/);
  createChange(loadProduct(root), 'add-remove', 'Replace an unused behavior with a new term');
  stage(loadProduct(root), 'add-remove', null, 'BEH-001');
  const term = template('term', 'TERM-002', 'Cart'); stage(loadProduct(root), 'add-remove', serialize(term.meta, term.body));
  approveChange(loadProduct(root), 'add-remove', 'reviewer'); applyChange(loadProduct(root), 'add-remove');
  assert.ok(loadProduct(root).items.some(i => i.meta.id === 'TERM-002')); assert.ok(!existsSync(join(root, 'product/behavior/BEH-001.md')));
});
test('paths cannot escape the product and symlinked docs are rejected', t => {
  const root = fixture(t), config = join(root, 'prodshape.json');
  writeFileSync(config, JSON.stringify({ schemaVersion: 1, name: 'Bad', docs: '../escape' }));
  assert.throws(() => loadProduct(root), /inside/);
  writeFileSync(config, JSON.stringify({ schemaVersion: 1, name: 'Bad', docs: 'linked' }));
  symlinkSync(join(root, 'product'), join(root, 'linked'), 'dir');
  assert.throws(() => loadProduct(root), /Symlinks/);
});
test('hand-edited change files cannot target files outside the docs directory', t => {
  const root = fixture(t); proposal(root);
  const path = join(root, '.prodshape/changes/minimum.json'), c = readChange(root, 'minimum');
  c.operations[0].file = '../outside.md'; writeFileSync(path, JSON.stringify(c));
  assert.throws(() => checkChange(loadProduct(root), 'minimum'), /inside/);
});
test('write lock refuses concurrent writers and releases after exceptions', t => {
  const root = fixture(t);
  assert.throws(() => withLock(root, () => withLock(root, () => {})), /Another write/);
  assert.ok(!existsSync(join(root, '.prodshape/write.lock')));
});
test('interrupted apply recovery restores baseline and approval', t => {
  const root = fixture(t); proposal(root); const change = approveChange(loadProduct(root), 'minimum', 'reviewer');
  const op = change.operations[0], path = join(root, op.file), before = readFileSync(path, 'utf8');
  writeFileSync(join(root, '.prodshape/pending.json'), JSON.stringify({ version: 1, change, entries: [{ file: op.file, before, after: op.content }] }));
  writeFileSync(path, op.content);
  assert.equal(command(root, 'validate').status, 2);
  assert.equal(recoverChange(root).recovered, 'minimum'); assert.equal(readFileSync(path, 'utf8'), before);
  assert.equal(readChange(root, 'minimum').status, 'approved');
});
test('recovery refuses to clobber edits made after an interruption', t => {
  const root = fixture(t); proposal(root); const change = approveChange(loadProduct(root), 'minimum', 'reviewer');
  const op = change.operations[0], path = join(root, op.file), before = readFileSync(path, 'utf8');
  writeFileSync(join(root, '.prodshape/pending.json'), JSON.stringify({ version: 1, change, entries: [{ file: op.file, before, after: op.content }] }));
  writeFileSync(path, op.content + '\nExternal edit');
  assert.throws(() => recoverChange(root), /external edit/); assert.ok(existsSync(join(root, '.prodshape/pending.json')));
});
test('CLI help, validation, JSON graph, missing IDs and usage errors have stable exit codes', t => {
  const root = fixture(t);
  assert.equal(command(root, '--help').status, 0);
  const validate = command(root, '--json', 'validate'); assert.equal(validate.status, 0); assert.equal(JSON.parse(validate.stdout).valid, true);
  const graph = command(root, 'graph', '--format', 'json'); assert.equal(JSON.parse(graph.stdout).nodes.length, 7);
  const unknown = command(root, 'show', 'BR-999', '--json'); assert.equal(unknown.status, 2); assert.equal(JSON.parse(unknown.stderr).error.code, 'UNKNOWN_ID');
  const badDepth = command(root, '--json', 'trace', 'BR-001', '--depth', '-1'); assert.equal(badDepth.status, 2); assert.equal(JSON.parse(badDepth.stderr).error.code, 'USAGE_ERROR');
  const item = rule(root); writeFileSync(join(root, item.file), 'invalid'); assert.equal(command(root, 'validate').status, 1);
});
test('CLI add uses the next ID, does not overwrite IDs, and rejects path injection', t => {
  const root = fixture(t), add = command(root, '--json', 'add', 'rule', 'Second rule');
  assert.equal(add.status, 0, add.stderr); assert.equal(JSON.parse(add.stdout).id, 'BR-002');
  assert.equal(command(root, 'add', 'rule', 'Duplicate', '--id', 'BR-001').status, 2);
  assert.equal(command(root, 'add', 'rule', 'Injection', '--id', '../oops').status, 2);
});
test('CLI citations support explicit refresh and reject unsafe targets or altered quotes', t => {
  const root = fixture(t), target = join(root, 'notes/design.md');
  assert.equal(command(root, 'cite', 'BR-001', '--into', 'notes/design.md').status, 0);
  assert.equal(command(root, 'citations', 'check').status, 0);
  const r = rule(root); writeFileSync(join(root, r.file), revised(root));
  const stale = command(root, '--json', 'citations', 'check'); assert.equal(stale.status, 1); assert.equal(JSON.parse(stale.stdout).summary.stale, 1);
  assert.equal(command(root, 'citations', 'refresh', 'notes/design.md').status, 0);
  assert.equal(command(root, 'validate', '--citations').status, 0);
  writeFileSync(target, readFileSync(target, 'utf8').replace('must be', 'may be'));
  assert.equal(command(root, 'citations', 'refresh', 'notes/design.md').status, 2);
  assert.equal(command(root, 'cite', 'BR-001', '--into', '../escape.md').status, 2);
  assert.equal(command(root, 'cite', 'BR-001', '--into', r.file).status, 2);
});
test('CLI end-to-end change workflow preserves draft until approved', t => {
  const root = fixture(t), original = rule(root).digest, draft = join(root, 'draft.md'); writeFileSync(draft, revised(root));
  for (const args of [['change', 'new', 'minimum', '--title', 'Minimum total'], ['change', 'stage', 'minimum', '--file', draft], ['change', 'check', 'minimum'], ['change', 'diff', 'minimum'], ['change', 'approve', 'minimum', '--by', 'reviewer'], ['change', 'apply', 'minimum']]) {
    const result = command(root, ...args); assert.equal(result.status, 0, result.stderr);
  }
  assert.notEqual(rule(root).digest, original); assert.equal(command(root, 'validate').status, 0);
});
