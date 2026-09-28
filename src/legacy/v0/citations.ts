import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { exclusiveWrite, inside, read, walk } from './fs.js';
import { canonical, DIGEST_RE, hash, ID_RE, normalize, stable } from './model.js';
import { ProdshapeError } from './types.js';
import type { CitationResult, Item, Product } from './types.js';

export function snapshotPath(root: string, digest: string): string {
  if (!DIGEST_RE.test(digest)) throw new ProdshapeError('Invalid SHA-256 digest.', 'INVALID_DIGEST');
  return inside(root, `.prodshape/snapshots/${digest.slice(7)}.json`);
}
export function saveSnapshot(root: string, item: Item): void {
  const file = snapshotPath(root, item.digest), content = canonical(item);
  if (existsSync(file)) {
    if (read(file) !== content) throw new ProdshapeError(`Snapshot integrity failure for ${item.meta.id}: ${item.digest}`, 'CORRUPT_SNAPSHOT');
  } else exclusiveWrite(file, content);
}
export function quote(item: Pick<Item, 'meta' | 'body'>): string {
  return [`**${item.meta.id} — ${item.meta.title}**`, '', item.body].join('\n').split('\n').map(line => line ? `> ${line}` : '>').join('\n');
}
export function citation(root: string, item: Item): string {
  saveSnapshot(root, item);
  return `<!-- prodshape:cite ${JSON.stringify({ version: 1, id: item.meta.id, digest: item.digest })} -->\n${quote(item)}\n<!-- /prodshape:cite -->\n`;
}
export function verifyText(product: Product, text: string, file: string): CitationResult[] {
  const lines = normalize(text).split('\n'), results: CitationResult[] = [];
  let fence: { char: string; size: number } | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (f) {
      if (!fence) fence = { char: f[1]![0]!, size: f[1]!.length };
      else if (f[1]![0] === fence.char && f[1]!.length >= fence.size && !f[2]!.trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    if (/^\s*<!-- \/prodshape:cite/.test(line)) {
      results.push({ file, line: index + 1, status: 'tampered', reason: 'Closing citation marker has no opening marker.' }); continue;
    }
    if (!/^\s*<!-- prodshape:cite/.test(line)) continue;
    const result: CitationResult = { file, line: index + 1, status: 'tampered', reason: 'Malformed citation marker.' };
    results.push(result);
    const opening = /^<!-- prodshape:cite (\{.*\}) -->$/.exec(line);
    let end = index + 1;
    while (end < lines.length && !/^\s*<!-- \/?prodshape:cite/.test(lines[end]!)) end++;
    const complete = end < lines.length && lines[end] === '<!-- /prodshape:cite -->';
    const quoted = lines.slice(index + 1, end).join('\n');
    if (complete) index = end;
    if (!opening || !complete) { result.reason = 'Citation has malformed or missing delimiters.'; continue; }
    let pin: { version: number; id: string; digest: string };
    try {
      pin = JSON.parse(opening[1]!);
      if (!pin || pin.version !== 1 || typeof pin.id !== 'string' || !ID_RE.test(pin.id) || typeof pin.digest !== 'string' || !DIGEST_RE.test(pin.digest) || Object.keys(pin).sort().join(',') !== 'digest,id,version') throw new Error();
    } catch { continue; }
    result.id = pin.id; result.digest = pin.digest;
    const current = product.items.find(i => i.meta.id === pin.id);
    let historical: Pick<Item, 'meta' | 'body'> | undefined;
    const path = snapshotPath(product.root, pin.digest);
    if (existsSync(path)) {
      const bytes = read(path);
      try {
        const snapshot = JSON.parse(bytes);
        if (hash(bytes) !== pin.digest || stable(snapshot) !== bytes || snapshot.schemaVersion !== 1 || snapshot.meta?.id !== pin.id || typeof snapshot.body !== 'string' || typeof snapshot.meta?.title !== 'string') throw new Error();
        historical = snapshot;
      } catch { result.reason = 'Stored snapshot does not match its digest or item ID.'; continue; }
    } else if (current?.digest === pin.digest) historical = current;
    if (!historical) { result.status = 'unresolved'; result.reason = 'Pinned snapshot is unavailable; the historical quote cannot be verified.'; continue; }
    if (quote(historical) !== quoted) { result.reason = 'Quoted content differs from the pinned snapshot.'; continue; }
    if (!current) { result.status = 'unresolved'; result.reason = 'The cited item no longer exists in this product.'; continue; }
    result.status = current.digest === pin.digest ? 'current' : 'stale';
    result.reason = result.status === 'current' ? 'Quote and source match the pinned digest.' : `Quote is intact, but source is now ${current.digest}.`;
  }
  return results;
}
export function verifyFiles(product: Product, files?: string[]): CitationResult[] {
  const paths = files?.length ? [...new Set(files.map(f => inside(product.root, f)))] : walk(product.root);
  return paths.flatMap(path => verifyText(product, read(path), relative(product.root, path).replaceAll('\\', '/')));
}
