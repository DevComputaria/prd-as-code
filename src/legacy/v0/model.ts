import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import { inside, json, read, walk } from './fs.js';
import { PREFIX, RELATIONS, TYPES, ProdshapeError } from './types.js';
import type { Config, Item, Metadata, Product, Issue, Graph, Edge } from './types.js';

export const ID_RE = /^[A-Z][A-Z0-9]*-\d{3,}$/;
export const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
export const normalize = (text: string): string => text.replace(/\r\n?/g, '\n');
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const hash = (text: string): string => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
export const canonical = (item: Pick<Item, 'meta' | 'body'>): string => stable({ schemaVersion: 1, meta: item.meta, body: item.body });
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function fail(file: string, message: string): never { throw new ProdshapeError(`${file}: ${message}`, 'INVALID_DOCUMENT'); }
export function parseItem(text: string, file: string): Item {
  const source = normalize(text).replace(/^\uFEFF/, '');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(source);
  if (!match) fail(file, 'Expected YAML front matter between --- delimiters at the start of the file.');
  const document = parseDocument(match[1]!, { uniqueKeys: true, strict: true });
  if (document.errors.length || document.warnings.length) fail(file, [...document.errors, ...document.warnings].map(e => e.message).join('; '));
  let raw: unknown;
  try { raw = document.toJS({ maxAliasCount: 0 }); } catch { fail(file, 'YAML aliases are not supported.'); }
  if (!record(raw)) fail(file, 'Front matter must be a mapping.');
  const allowed = ['id', 'type', 'title', 'status', 'relations', 'behavior'];
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) fail(file, `Unknown field "${key}". Allowed: ${allowed.join(', ')}.`);
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) fail(file, 'id must look like BR-001 or REQ-001.');
  if (!TYPES.includes(raw.type as Metadata['type'])) fail(file, `type must be one of: ${TYPES.join(', ')}.`);
  const type = raw.type as Metadata['type'];
  if (!raw.id.startsWith(`${PREFIX[type]}-`)) fail(file, `Type ${type} requires the ${PREFIX[type]}- prefix.`);
  if (typeof raw.title !== 'string' || !raw.title.trim() || /[\r\n]/.test(raw.title)) fail(file, 'title must be a nonempty single line.');
  const status = raw.status ?? 'draft';
  if (!['draft', 'active', 'deprecated'].includes(status as string)) fail(file, 'status must be draft, active, or deprecated.');
  const relations: Metadata['relations'] = {};
  if (raw.relations !== undefined) {
    if (!record(raw.relations)) fail(file, 'relations must be a mapping from relation names to ID arrays.');
    for (const [name, ids] of Object.entries(raw.relations)) {
      if (!RELATIONS.includes(name as typeof RELATIONS[number])) fail(file, `Unknown relation "${name}". Allowed: ${RELATIONS.join(', ')}.`);
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !ID_RE.test(id))) fail(file, `relations.${name} must be an array of IDs.`);
      if (new Set(ids).size !== ids.length) fail(file, `relations.${name} contains duplicate IDs.`);
      relations[name as typeof RELATIONS[number]] = [...ids].sort();
    }
  }
  const meta: Metadata = { id: raw.id, type, title: raw.title.trim(), status: status as Metadata['status'], relations };
  if (type === 'behavior') {
    if (!record(raw.behavior) || Object.keys(raw.behavior).some(k => !['given', 'when', 'then'].includes(k))) fail(file, 'behavior requires only given, when, and then arrays.');
    const behavior = raw.behavior as Record<string, unknown>;
    for (const key of ['given', 'when', 'then']) if (!Array.isArray(behavior[key]) || !(behavior[key] as unknown[]).length || (behavior[key] as unknown[]).some(s => typeof s !== 'string' || !s.trim())) fail(file, `behavior.${key} requires a nonempty array of strings.`);
    meta.behavior = behavior as Metadata['behavior'];
  } else if (raw.behavior !== undefined) fail(file, 'Only behavior documents may have a behavior field.');
  const body = match[2]!.replace(/^\n+|\n+$/g, '');
  if (!body.trim()) fail(file, 'Markdown body must not be empty.');
  return { meta, body, file, digest: hash(canonical({ meta, body })) };
}
export function serialize(meta: Metadata, body: string): string { return `---\n${stringify(meta, { lineWidth: 0 })}---\n\n${body.trim()}\n`; }
export function loadProduct(root: string): Product {
  const raw = json<Config>(inside(root, 'prodshape.json'));
  if (!record(raw) || raw.schemaVersion !== 1 || typeof raw.name !== 'string' || !raw.name.trim() || typeof raw.docs !== 'string' || !raw.docs.trim() || Object.keys(raw).some(k => !['schemaVersion', 'name', 'docs'].includes(k))) throw new ProdshapeError('prodshape.json requires schemaVersion: 1, name, and docs; no extra fields.', 'INVALID_CONFIG');
  const docs = inside(root, raw.docs);
  if (raw.docs.split(/[\\/]/).includes('.prodshape')) throw new ProdshapeError('docs cannot use the reserved .prodshape directory.', 'INVALID_CONFIG');
  const product: Product = { root, config: raw, items: [], issues: [] };
  if (!existsSync(docs)) product.issues.push({ code: 'MISSING_DOCS', message: `Product directory does not exist: ${raw.docs}` });
  for (const file of walk(docs)) {
    const path = relative(root, file).replaceAll('\\', '/');
    try { product.items.push(parseItem(read(file), path)); }
    catch (e) { product.issues.push({ code: 'INVALID_DOCUMENT', message: (e as Error).message, file: path }); }
  }
  product.issues.push(...validateItems(product.items));
  if (!product.items.length) product.issues.push({ code: 'EMPTY_PRODUCT', message: 'No valid product items found. Use "prodshape add" to create one.' });
  return product;
}
// Code examples and pinned citation blocks do not create live graph edges.
export function prose(body: string): string {
  let fence: { char: string; size: number } | undefined;
  return body.replace(/<!-- prodshape:cite[\s\S]*?<!-- \/prodshape:cite -->/g, '').split('\n').map(line => {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (m) {
      if (!fence) fence = { char: m[1]![0]!, size: m[1]!.length };
      else if (m[1]![0] === fence.char && m[1]!.length >= fence.size && !m[2]!.trim()) fence = undefined;
      return '';
    }
    return fence ? '' : line.replace(/(`+)[\s\S]*?\1/g, '');
  }).join('\n');
}
export function edges(items: Item[]): Edge[] {
  const found: Edge[] = [];
  for (const item of items) {
    for (const [relation, targets] of Object.entries(item.meta.relations)) for (const to of targets) found.push({ from: item.meta.id, to, relation });
    for (const m of prose(item.body).matchAll(/\[\[([A-Z][A-Z0-9]*-\d{3,})(?:\|[^\]\n]+)?\]\]/g)) found.push({ from: item.meta.id, to: m[1]!, relation: 'references' });
  }
  return [...new Map(found.map(e => [stable(e), e])).values()].sort((a, b) => stable(a).localeCompare(stable(b), 'en'));
}
export function validateItems(items: Item[]): Issue[] {
  const issues: Issue[] = [], byId = new Map<string, Item>();
  for (const item of items) {
    if (byId.has(item.meta.id)) issues.push({ code: 'DUPLICATE_ID', id: item.meta.id, file: item.file, message: `${item.meta.id} is also defined in ${byId.get(item.meta.id)!.file}.` });
    byId.set(item.meta.id, item);
  }
  const typed: Record<string, string[]> = { 'performed-by': ['actor'], 'governed-by': ['rule'], defines: ['term'], satisfies: ['requirement'], verifies: ['requirement', 'use-case', 'rule', 'behavior'] };
  const allEdges = edges(items);
  for (const edge of allEdges) {
    const target = byId.get(edge.to), source = byId.get(edge.from)!;
    let message: string | undefined;
    let code = 'INVALID_RELATION';
    if (!target) { message = `${edge.from} ${edge.relation} unresolved ID ${edge.to}.`; code = 'UNRESOLVED_REFERENCE'; }
    else if (edge.from === edge.to) message = `${edge.from} cannot reference itself.`;
    else if (typed[edge.relation] && !typed[edge.relation]!.includes(target.meta.type)) message = `${edge.relation} must target ${typed[edge.relation]!.join(' or ')}, but ${edge.to} is ${target.meta.type}.`;
    if (message) issues.push({ code, message, file: source.file, id: source.meta.id });
  }
  // Only dependency edges are acyclic; other product relationships can form cycles.
  const visiting = new Set<string>(), visited = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const e of allEdges.filter(e => e.relation === 'depends-on')) adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e.to]);
  function visit(id: string, path: string[]): void {
    if (visiting.has(id)) { issues.push({ code: 'DEPENDENCY_CYCLE', id, message: `Dependency cycle: ${[...path, id].join(' → ')}.` }); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) visit(next, [...path, id]);
    visiting.delete(id); visited.add(id);
  }
  for (const id of byId.keys()) visit(id, []);
  return issues;
}
export function requireValid(product: Product): void {
  if (product.issues.length) throw new ProdshapeError(`Product has ${product.issues.length} validation issue(s). Run "prodshape validate" for details.`, 'VALIDATION_FAILED', product.issues);
}
export function getItem(product: Product, id: string): Item {
  const item = product.items.find(i => i.meta.id === id);
  if (!item) throw new ProdshapeError(`Unknown item ${id}. Run "prodshape list" to see available IDs.`, 'UNKNOWN_ID');
  return item;
}
export function buildGraph(items: Item[]): Graph { return { nodes: items.map(i => ({ id: i.meta.id, type: i.meta.type, title: i.meta.title, digest: i.digest })).sort((a, b) => a.id.localeCompare(b.id, 'en')), edges: edges(items) }; }
export function connected(items: Item[], id: string, direction: 'in' | 'out' | 'both', depth: number): Graph {
  const graph = buildGraph(items), reached = new Set([id]);
  let frontier = [id];
  for (let step = 0; step < depth && frontier.length; step++) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      if (direction !== 'in' && frontier.includes(edge.from) && !reached.has(edge.to)) next.add(edge.to);
      if (direction !== 'out' && frontier.includes(edge.to) && !reached.has(edge.from)) next.add(edge.from);
    }
    for (const value of next) reached.add(value);
    frontier = [...next];
  }
  return { nodes: graph.nodes.filter(n => reached.has(n.id)), edges: graph.edges.filter(e => reached.has(e.from) && reached.has(e.to)) };
}
export function fingerprint(product: Product): string { return hash(stable({ config: product.config, items: product.items.map(i => ({ id: i.meta.id, file: i.file, digest: i.digest })).sort((a, b) => a.id.localeCompare(b.id, 'en')) })); }
export function mermaid(graph: Graph): string {
  const escape = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('[', '&#91;').replaceAll(']', '&#93;');
  const ids = new Map(graph.nodes.map((n, i) => [n.id, `n${i}`]));
  return ['flowchart TD', ...graph.nodes.map(n => `  ${ids.get(n.id)}["${escape(n.id)}: ${escape(n.title)}"]`), ...graph.edges.map(e => `  ${ids.get(e.from)} -->|${e.relation}| ${ids.get(e.to)}`)].join('\n');
}
