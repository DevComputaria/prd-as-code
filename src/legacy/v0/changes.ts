import { existsSync, rmSync } from 'node:fs';
import { relative } from 'node:path';
import { atomicWrite, exclusiveWrite, inside, json, read } from './fs.js';
import { connected, fingerprint, hash, loadProduct, parseItem, requireValid, stable, validateItems } from './model.js';
import { saveSnapshot } from './citations.js';
import { ProdshapeError } from './types.js';
import type { Item, Product } from './types.js';

export interface Operation { id: string; file: string; content: string | null }
export interface Change {
  version: 1; id: string; title: string; createdAt: string; base: string;
  status: 'draft' | 'approved' | 'applied'; operations: Operation[];
  approval?: { by: string; at: string; digest: string };
  appliedAt?: string;
}
interface Journal { version: 1; change: Change; entries: { file: string; before: string | null; after: string | null }[] }
const pendingFile = (root: string): string => inside(root, '.prodshape/pending.json');
export function assertNoPending(root: string): void {
  if (existsSync(pendingFile(root))) throw new ProdshapeError('An interrupted change needs recovery. Run "prodshape change recover" before writing.', 'RECOVERY_REQUIRED');
}
function changeFile(root: string, id: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new ProdshapeError('Change ID must be 1–64 lowercase letters, digits, or hyphens, starting with a letter or digit.', 'INVALID_CHANGE_ID');
  return inside(root, `.prodshape/changes/${id}.json`);
}
function docPath(product: Product, file: string): string {
  const path = inside(product.root, file);
  inside(inside(product.root, product.config.docs), relative(inside(product.root, product.config.docs), path));
  if (!path.endsWith('.md') || file.split(/[\\/]/).some(p => ['.prodshape', '.git', 'node_modules', 'dist'].includes(p))) throw new ProdshapeError(`Change target must be a Markdown file under ${product.config.docs}: ${file}`, 'UNSAFE_PATH');
  return path;
}
function validateChange(value: Change, id: string): void {
  if (!value || value.version !== 1 || value.id !== id || typeof value.title !== 'string' || !value.title.trim() || typeof value.base !== 'string' || !['draft', 'approved', 'applied'].includes(value.status) || !Array.isArray(value.operations)) throw new ProdshapeError(`Invalid change file: ${id}`, 'INVALID_CHANGE');
  for (const op of value.operations) if (!op || typeof op.id !== 'string' || typeof op.file !== 'string' || (op.content !== null && typeof op.content !== 'string')) throw new ProdshapeError(`Invalid operation in ${id}`, 'INVALID_CHANGE');
  if (new Set(value.operations.map(o => o.id)).size !== value.operations.length || new Set(value.operations.map(o => o.file)).size !== value.operations.length) throw new ProdshapeError('Change contains duplicate IDs or paths.', 'INVALID_CHANGE');
}
export function readChange(root: string, id: string): Change {
  const file = changeFile(root, id);
  if (!existsSync(file)) throw new ProdshapeError(`Unknown change ${id}. Run "prodshape change new ${id} --title <title>".`, 'UNKNOWN_CHANGE');
  const change = json<Change>(file); validateChange(change, id); return change;
}
export function changeDigest(change: Change): string { return hash(stable({ version: change.version, id: change.id, title: change.title, base: change.base, operations: change.operations })); }
export function createChange(product: Product, id: string, title: string): Change {
  assertNoPending(product.root); requireValid(product);
  if (!title.trim()) throw new ProdshapeError('Change title must not be empty.', 'INVALID_CHANGE');
  const change: Change = { version: 1, id, title, createdAt: new Date().toISOString(), base: fingerprint(product), status: 'draft', operations: [] };
  const file = changeFile(product.root, id);
  if (existsSync(file)) throw new ProdshapeError(`Change ${id} already exists. Choose another ID.`, 'CHANGE_EXISTS');
  exclusiveWrite(file, JSON.stringify(change, null, 2) + '\n'); return change;
}
function checkBaseline(product: Product, change: Change): void {
  requireValid(product);
  if (fingerprint(product) !== change.base) throw new ProdshapeError('The product changed since this proposal was created. Create a fresh proposal against the current product and review it again.', 'BASELINE_CONFLICT');
}
export function stage(product: Product, id: string, content: string | null, removeId?: string): Change {
  assertNoPending(product.root);
  const change = readChange(product.root, id);
  if (change.status === 'applied') throw new ProdshapeError('Applied changes are immutable. Create a new proposal.', 'ALREADY_APPLIED');
  checkBaseline(product, change);
  let item: Item | undefined, targetId: string;
  if (content !== null) { item = parseItem(content, '<staged>'); targetId = item.meta.id; }
  else { if (!removeId) throw new ProdshapeError('Provide an ID to remove.', 'INVALID_CHANGE'); targetId = removeId; }
  const existing = product.items.find(i => i.meta.id === targetId);
  if (!item && !existing) throw new ProdshapeError(`Cannot remove unknown item ${targetId}.`, 'UNKNOWN_ID');
  const file = existing?.file ?? `${product.config.docs}/${item!.meta.type}/${targetId}.md`;
  docPath(product, file);
  if (!existing && existsSync(inside(product.root, file))) throw new ProdshapeError(`Target file already exists: ${file}`, 'FILE_EXISTS');
  change.operations = [...change.operations.filter(o => o.id !== targetId), { id: targetId, file, content }].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  change.status = 'draft'; delete change.approval;
  atomicWrite(changeFile(product.root, id), JSON.stringify(change, null, 2) + '\n'); return change;
}
export function candidate(product: Product, change: Change): Product {
  validateChange(change, change.id); checkBaseline(product, change);
  if (!change.operations.length) throw new ProdshapeError('The proposal is empty. Stage at least one file or removal.', 'EMPTY_CHANGE');
  const items = new Map(product.items.map(i => [i.meta.id, i]));
  for (const op of change.operations) {
    docPath(product, op.file);
    const old = items.get(op.id);
    if (old && old.file !== op.file) throw new ProdshapeError(`Changing paths is not supported for ${op.id}.`, 'INVALID_CHANGE');
    if (!old && (op.content === null || existsSync(inside(product.root, op.file)))) throw new ProdshapeError(`Invalid add/remove target: ${op.file}`, 'INVALID_CHANGE');
    if (op.content === null) items.delete(op.id);
    else {
      const item = parseItem(op.content, op.file);
      if (item.meta.id !== op.id) throw new ProdshapeError(`Operation ID does not match content: ${op.id}`, 'INVALID_CHANGE');
      items.set(op.id, item);
    }
  }
  const all = [...items.values()];
  const issues = validateItems(all);
  if (!all.length) issues.push({ code: 'EMPTY_PRODUCT', message: 'A change cannot remove every product item.' });
  if (new Set(all.map(i => i.file)).size !== all.length) issues.push({ code: 'DUPLICATE_PATH', message: 'Multiple items target the same file.' });
  return { ...product, items: all, issues };
}
export function checkChange(product: Product, id: string) {
  const change = readChange(product.root, id), proposed = candidate(product, change);
  const impacted = new Set<string>();
  for (const op of change.operations) for (const source of [product, proposed]) for (const n of connected(source.items, op.id, 'in', source.items.length).nodes) impacted.add(n.id);
  return { change: id, status: change.status, digest: changeDigest(change), valid: proposed.issues.length === 0, issues: proposed.issues, impacted: [...impacted].sort(), operations: change.operations.map(op => ({ id: op.id, file: op.file, action: op.content === null ? 'remove' : product.items.some(i => i.meta.id === op.id) ? 'update' : 'add', before: product.items.find(i => i.meta.id === op.id)?.digest ?? null, after: proposed.items.find(i => i.meta.id === op.id)?.digest ?? null })) };
}
export function approveChange(product: Product, id: string, by: string): Change {
  assertNoPending(product.root);
  if (!by.trim()) throw new ProdshapeError('Reviewer name must not be empty.', 'INVALID_REVIEWER');
  const change = readChange(product.root, id);
  if (change.status === 'applied') throw new ProdshapeError('Change already applied.', 'ALREADY_APPLIED');
  const proposed = candidate(product, change);
  if (proposed.issues.length) throw new ProdshapeError(`Proposal has validation issues. Run "prodshape change check ${id}" for details.`, 'VALIDATION_FAILED', proposed.issues);
  change.status = 'approved'; change.approval = { by, at: new Date().toISOString(), digest: changeDigest(change) };
  atomicWrite(changeFile(product.root, id), JSON.stringify(change, null, 2) + '\n'); return change;
}
function writeVersion(path: string, content: string | null): void { if (content === null) rmSync(path, { force: true }); else atomicWrite(path, content); }
export function applyChange(product: Product, id: string): Change {
  assertNoPending(product.root);
  const change = readChange(product.root, id);
  if (change.status !== 'approved' || change.approval?.digest !== changeDigest(change)) throw new ProdshapeError('This exact proposal must be approved before applying. Run "prodshape change check", then "prodshape change approve".', 'APPROVAL_REQUIRED');
  const proposed = candidate(product, change); requireValid(proposed);
  for (const item of [...product.items, ...proposed.items]) saveSnapshot(product.root, item);
  const journal: Journal = { version: 1, change, entries: change.operations.map(op => ({ file: op.file, before: existsSync(inside(product.root, op.file)) ? read(inside(product.root, op.file)) : null, after: op.content })) };
  atomicWrite(pendingFile(product.root), JSON.stringify(journal, null, 2) + '\n');
  try {
    for (const entry of journal.entries) writeVersion(docPath(product, entry.file), entry.after);
    requireValid(loadProduct(product.root));
    const applied: Change = { ...change, status: 'applied', appliedAt: new Date().toISOString() };
    atomicWrite(changeFile(product.root, id), JSON.stringify(applied, null, 2) + '\n');
    rmSync(pendingFile(product.root)); return applied;
  } catch (error) {
    try { recoverChange(product.root); }
    catch { throw new ProdshapeError('Apply failed and rollback could not finish. Inspect .prodshape/pending.json and run "prodshape change recover".', 'RECOVERY_REQUIRED'); }
    throw error;
  }
}
export function recoverChange(root: string): { recovered: string } {
  const file = pendingFile(root);
  if (!existsSync(file)) throw new ProdshapeError('No interrupted change to recover.', 'NO_PENDING_CHANGE');
  const journal = json<Journal>(file);
  if (!journal || journal.version !== 1 || !journal.change || !Array.isArray(journal.entries)) throw new ProdshapeError('Invalid recovery journal. Restore it from a trusted backup.', 'INVALID_JOURNAL');
  validateChange(journal.change, journal.change.id);
  if (journal.change.approval?.digest !== changeDigest(journal.change) || journal.entries.length !== journal.change.operations.length) throw new ProdshapeError('Recovery journal does not match its approved proposal.', 'INVALID_JOURNAL');
  const product = loadProduct(root);
  for (let i = 0; i < journal.entries.length; i++) {
    const entry = journal.entries[i]!, op = journal.change.operations[i]!;
    if (!entry || entry.file !== op.file || entry.after !== op.content || (entry.before !== null && typeof entry.before !== 'string')) throw new ProdshapeError('Invalid journal entry.', 'INVALID_JOURNAL');
    const path = docPath(product, entry.file), actual = existsSync(path) ? read(path) : null;
    if (actual !== entry.before && actual !== entry.after) throw new ProdshapeError(`Recovery would overwrite an external edit in ${entry.file}. Preserve that edit, then restore the expected before/after content before retrying.`, 'RECOVERY_CONFLICT');
  }
  for (const entry of journal.entries) writeVersion(docPath(product, entry.file), entry.before);
  atomicWrite(changeFile(root, journal.change.id), JSON.stringify(journal.change, null, 2) + '\n');
  rmSync(file); return { recovered: journal.change.id };
}
