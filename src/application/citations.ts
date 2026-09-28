import type { Workspace } from './ports/workspace.js';
import { canonical, IntentError } from '../domain/model.js';
import type { Model, SourceArtifact } from '../domain/model.js';
import { digest } from '../domain/digest.js';
export const pinPattern = /^sha256:[a-f0-9]{64}$/;
function snapshotPath(hash: string) { if (!pinPattern.test(hash)) throw new IntentError('INVALID_DIGEST', 'Expected SHA-256 digest.'); return `.intent/snapshots/${hash.slice(7)}.json`; }
export function preserve(workspace: Workspace, source: SourceArtifact) {
  const path = snapshotPath(source.digest), content = canonical(source), existing = workspace.read(path);
  if (existing !== null && existing !== content) throw new IntentError('CORRUPT_SNAPSHOT', `Snapshot ${source.digest} was modified.`);
  if (existing === null) workspace.write(path, content);
}
function quote(canonicalText: string) { return JSON.stringify(JSON.parse(canonicalText), null, 2).split('\n').map(line => '> ' + line).join('\n'); }
export function makeCitation(workspace: Workspace, source: SourceArtifact) {
  preserve(workspace, source);
  return `<!-- intent:cite ${JSON.stringify({ version: 1, id: source.artifact.metadata.id, digest: source.digest })} -->\n${quote(canonical(source))}\n<!-- /intent:cite -->\n`;
}
export interface CitationResult { file: string; line: number; id?: string; status: 'current' | 'stale' | 'tampered' | 'unresolved'; reason: string }
export function checkText(workspace: Workspace, model: Model, file: string, text: string): CitationResult[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'), results: CitationResult[] = [];
  let fence: { char: string; size: number } | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!, f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (f) { if (!fence) fence = { char: f[1]![0]!, size: f[1]!.length }; else if (f[1]![0] === fence.char && f[1]!.length >= fence.size && !f[2]!.trim()) fence = undefined; continue; }
    if (fence || !/^\s*<!-- \/?intent:cite/.test(line)) continue;
    const result: CitationResult = { file, line: i + 1, status: 'tampered', reason: 'Malformed citation.' }; results.push(result);
    const start = /^<!-- intent:cite (\{.*\}) -->$/.exec(line); if (!start) continue;
    let end = i + 1; while (end < lines.length && !/^\s*<!-- \/?intent:cite/.test(lines[end]!)) end++;
    if (lines[end] !== '<!-- /intent:cite -->') continue;
    const body = lines.slice(i + 1, end).join('\n'); i = end;
    try {
      const pin = JSON.parse(start[1]!);
      if (pin.version !== 1 || typeof pin.id !== 'string' || !pinPattern.test(pin.digest) || Object.keys(pin).sort().join(',') !== 'digest,id,version') continue;
      result.id = pin.id;
      const current = model.artifacts.find(s => s.artifact.metadata.id === pin.id);
      let source = workspace.read(snapshotPath(pin.digest));
      if (source === null && current && current.digest === pin.digest) source = canonical(current);
      if (source === null) { result.status = 'unresolved'; result.reason = 'Historical snapshot unavailable.'; continue; }
      if (digest(source) !== pin.digest || JSON.parse(source).artifact?.metadata?.id !== pin.id) { result.reason = 'Snapshot integrity mismatch.'; continue; }
      if (quote(source) !== body) { result.reason = 'Quote differs from pinned content.'; continue; }
      result.status = !current ? 'unresolved' : current.digest === pin.digest ? 'current' : 'stale';
      result.reason = !current ? 'Source artifact is missing.' : current.digest === pin.digest ? 'Quote and source match.' : 'Source artifact has changed.';
    } catch { result.reason = 'Invalid marker or snapshot.'; }
  }
  return results;
}
