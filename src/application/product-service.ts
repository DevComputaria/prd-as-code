import { IntentError, sortedJson } from '../domain/model.js';
import type { Model, SourceFile } from '../domain/model.js';
import { decisionTests } from '../domain/decisions.js';
import type { DecisionSpec } from '../domain/decisions.js';
import { digest } from '../domain/digest.js';
import { checkText, makeCitation, preserve } from './citations.js';
import type { Workspace } from './ports/workspace.js';
import type { Compiler } from './ports/compiler.js';
export interface Change {
  version: 1; id: string; title: string; baseline: string; state: 'draft' | 'approved' | 'applied';
  operations: { path: string; content: string | null }[];
  approval?: { by: string; digest: string; at: string };
}
interface Journal { version: 1; change: Change; entries: { path: string; before: string | null; after: string | null }[] }
const pending = '.intent/pending.json';
export function proposalDigest(change: Change): string { return digest(sortedJson({ version: change.version, id: change.id, title: change.title, baseline: change.baseline, operations: change.operations })); }
export class ProductService {
  constructor(readonly workspace: Workspace, readonly compiler: Compiler) {}
  private noPending() { if (this.workspace.read(pending) !== null) throw new IntentError('RECOVERY_REQUIRED', 'Interrupted apply: run prd change recover.'); }
  private write<T>(fn: () => T): T { return this.workspace.lock(() => { this.noPending(); return fn(); }); }
  compile(files = this.workspace.productFiles()): Model { const m = this.compiler.compile(files); m.baseline = digest(m.baseline + '\n' + this.workspace.read('intent.config.yaml')); return m; }
  load(strict = false): Model { this.noPending(); const m = this.compile(); this.assertValid(m, strict); return m; }
  assertValid(model: Model, strict = false) { if (model.diagnostics.some(d => d.severity === 'error' || (strict && d.severity === 'unsupported'))) throw new IntentError('VALIDATION_FAILED', 'Product validation failed.', model.diagnostics); }
  validate(strict = false) { this.noPending(); const model = this.compile(); return { valid: !model.diagnostics.some(d => d.severity === 'error' || (strict && d.severity === 'unsupported')), model }; }
  test() { return this.testModel(this.load()); }
  testModel(model: Model) {
    const results = model.artifacts.filter(s => s.artifact.kind === 'Decision').flatMap(s => decisionTests(s.artifact.spec as unknown as DecisionSpec).map(r => ({ decision: s.artifact.metadata.id, digest: s.digest, ...r })));
    const covered = new Set(results.map(r => r.scenario).filter(Boolean));
    return { passed: results.every(r => r.passed), tests: results, unboundScenarios: model.scenarios.filter(s => !covered.has(s.id)).map(s => s.id), scope: 'decision-model cases only; Gherkin steps and application code are not executed' };
  }
  private assertTests(model: Model) { const result = this.testModel(model); if (!result.passed) throw new IntentError('DECISION_TEST_FAILED', 'Candidate decision cases failed.', result.tests); }
  cite(id: string) { return this.write(() => { const s = this.load().artifacts.find(s => s.artifact.metadata.id === id); if (!s) throw new IntentError('UNKNOWN_ID', id); return makeCitation(this.workspace, s); }); }
  citations() { const model = this.load(); const citations = this.workspace.markdownFiles().flatMap(f => checkText(this.workspace, model, f.path, f.text)); return { valid: citations.every(c => c.status === 'current') && (!this.workspace.config().policies.requireCitations || citations.length > 0), citations, requireCitations: this.workspace.config().policies.requireCitations }; }
  refreshCitation(file: string) { return this.write(() => {
    this.documentPath(file); const text = this.workspace.read(file); if (text === null) throw new IntentError('NOT_FOUND', file);
    const model = this.load(), results = checkText(this.workspace, model, file, text);
    if (!results.length || results.some(c => c.status === 'tampered' || c.status === 'unresolved')) throw new IntentError('UNSAFE_REFRESH', 'No intact matching citations to refresh. Inspect the document.', results);
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    for (const r of [...results].reverse()) { const end = lines.indexOf('<!-- /intent:cite -->', r.line); lines.splice(r.line - 1, end - r.line + 2, ...makeCitation(this.workspace, model.artifacts.find(s => s.artifact.metadata.id === r.id)!).trimEnd().split('\n')); }
    this.workspace.write(file, lines.join('\n')); return { file, refreshed: results.length };
  }); }
  private documentPath(path: string) {
    const p = this.workspace.config().product.replace(/\/$/, '') + '/';
    if (!path.endsWith('.md') || path.startsWith(p) || path.split(/[\\/]/).some(s => ['..', '.', '.intent', '.prodshape', '.git', 'node_modules', 'framework'].includes(s))) throw new IntentError('UNSAFE_PATH', 'Citations must be in supporting Markdown outside product/ and reserved directories.');
    this.workspace.read(path); // adapter enforces physical containment and symlink policy
  }
  citeInto(id: string, file: string) { return this.write(() => { this.documentPath(file); const model = this.load(), source = model.artifacts.find(s => s.artifact.metadata.id === id); if (!source) throw new IntentError('UNKNOWN_ID', id); this.workspace.write(file, (this.workspace.read(file)?.trimEnd() ?? '') + '\n\n' + makeCitation(this.workspace, source)); return { id, file, digest: source.digest }; }); }
  private changePath(id: string) { if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new IntentError('INVALID_CHANGE_ID', 'Use a lowercase slug of up to 64 characters.'); return `.intent/changes/${id}.json`; }
  private target(path: string) {
    const prefix = this.workspace.config().product.replace(/\/$/, '') + '/';
    if (!path.startsWith(prefix) || path.split(/[\\/]/).some(s => ['..', '.', '.intent', '.prodshape', '.git', 'node_modules', 'dist', 'framework'].includes(s)) || !/\.(yaml|yml|md|feature)$/.test(path)) throw new IntentError('UNSAFE_PATH', `Proposal target must be below ${prefix}: ${path}`);
    this.workspace.read(path);
  }
  readChange(id: string): Change {
    const raw = this.workspace.read(this.changePath(id)); if (raw === null) throw new IntentError('UNKNOWN_CHANGE', id);
    const c = JSON.parse(raw) as Change;
    if (!c || c.version !== 1 || c.id !== id || typeof c.title !== 'string' || !c.title.trim() || typeof c.baseline !== 'string' || !['draft', 'approved', 'applied'].includes(c.state) || !Array.isArray(c.operations)) throw new IntentError('INVALID_CHANGE', id);
    for (const op of c.operations) { if (!op || typeof op.path !== 'string' || (op.content !== null && typeof op.content !== 'string')) throw new IntentError('INVALID_CHANGE', id); this.target(op.path); }
    if (new Set(c.operations.map(o => o.path)).size !== c.operations.length) throw new IntentError('INVALID_CHANGE', 'Duplicate targets.');
    return c;
  }
  private save(c: Change) { this.workspace.write(this.changePath(c.id), JSON.stringify(c, null, 2) + '\n'); }
  createChange(id: string, title: string) { return this.write(() => { const model = this.load(); if (!title.trim()) throw new IntentError('INVALID_TITLE', 'Empty title.'); if (this.workspace.read(this.changePath(id)) !== null) throw new IntentError('ALREADY_EXISTS', id); const c: Change = { version: 1, id, title, baseline: model.baseline, state: 'draft', operations: [] }; this.save(c); return c; }); }
  private baseline(c: Change) { const m = this.load(); if (m.baseline !== c.baseline) throw new IntentError('BASELINE_CONFLICT', 'Workspace changed since proposal creation. Create and review a fresh proposal.'); return m; }
  stage(id: string, path: string, content: string | null) { return this.write(() => { const c = this.readChange(id); if (c.state === 'applied') throw new IntentError('ALREADY_APPLIED', id); this.baseline(c); this.target(path); if (content === null && this.workspace.read(path) === null) throw new IntentError('NOT_FOUND', path); c.operations = [...c.operations.filter(o => o.path !== path), { path, content }].sort((a, b) => a.path.localeCompare(b.path)); c.state = 'draft'; delete c.approval; this.save(c); return c; }); }
  candidate(id: string) {
    const change = this.readChange(id); this.baseline(change); if (!change.operations.length) throw new IntentError('EMPTY_CHANGE', id);
    const files = new Map(this.workspace.productFiles().map(f => [f.path, f.text]));
    for (const op of change.operations) if (op.content === null) files.delete(op.path); else files.set(op.path, op.content);
    return { change, model: this.compile([...files].map(([path, text]) => ({ path, text }))) };
  }
  approve(id: string, by: string) { return this.write(() => { if (!by.trim()) throw new IntentError('INVALID_REVIEWER', 'Reviewer required.'); const { change, model } = this.candidate(id); if (change.state === 'applied') throw new IntentError('ALREADY_APPLIED', id); this.assertValid(model, true); this.assertTests(model); change.state = 'approved'; change.approval = { by, at: new Date().toISOString(), digest: proposalDigest(change) }; this.save(change); return change; }); }
  apply(id: string) { return this.write(() => {
    const { change, model } = this.candidate(id); this.assertValid(model, true); this.assertTests(model);
    if (change.state !== 'approved' || change.approval?.digest !== proposalDigest(change)) throw new IntentError('APPROVAL_REQUIRED', 'Approve this exact proposal before applying.');
    for (const source of [...this.load().artifacts, ...model.artifacts]) preserve(this.workspace, source);
    const journal: Journal = { version: 1, change, entries: change.operations.map(o => ({ path: o.path, before: this.workspace.read(o.path), after: o.content })) };
    this.workspace.write(pending, JSON.stringify(journal));
    try {
      for (const e of journal.entries) if (e.after === null) this.workspace.remove(e.path); else this.workspace.write(e.path, e.after);
      this.assertValid(this.compile(), true); const applied: Change = { ...change, state: 'applied' }; this.save(applied); this.workspace.remove(pending); return applied;
    } catch (error) { try { this.recoverUnlocked(); } catch { throw new IntentError('RECOVERY_REQUIRED', 'Apply and automatic rollback failed. Inspect pending.json, then run change recover.'); } throw error; }
  }); }
  recover() { return this.workspace.lock(() => this.recoverUnlocked()); }
  private recoverUnlocked() {
    const raw = this.workspace.read(pending); if (!raw) throw new IntentError('NO_PENDING_CHANGE', 'No pending journal.');
    const j = JSON.parse(raw) as Journal;
    if (j.version !== 1 || !j.change || !Array.isArray(j.entries) || !Array.isArray(j.change.operations) || j.entries.length !== j.change.operations.length || j.change.approval?.digest !== proposalDigest(j.change)) throw new IntentError('INVALID_JOURNAL', 'Journal validation failed.');
    this.changePath(j.change.id);
    for (let i = 0; i < j.entries.length; i++) {
      const e = j.entries[i]!, op = j.change.operations[i]!;
      if (!e || typeof e.path !== 'string' || e.path !== op.path || e.after !== op.content || (e.before !== null && typeof e.before !== 'string')) throw new IntentError('INVALID_JOURNAL', 'Invalid journal entry.');
      this.target(e.path); const actual = this.workspace.read(e.path);
      if (actual !== e.before && actual !== e.after) throw new IntentError('RECOVERY_CONFLICT', `External edit detected: ${e.path}`);
    }
    for (const e of j.entries) if (e.before === null) this.workspace.remove(e.path); else this.workspace.write(e.path, e.before);
    this.save(j.change); this.workspace.remove(pending); return { recovered: j.change.id };
  }
}
