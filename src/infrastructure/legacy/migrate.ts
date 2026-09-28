import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { stringify } from 'yaml';
import { loadProduct, requireValid, edges } from '../../legacy/v0/model.js';
import { withLock } from '../../legacy/v0/fs.js';
import { API_VERSION, IntentError } from '../../domain/model.js';
import type { Kind } from '../../domain/model.js';
import { safePath, writeAtomic } from '../filesystem/workspace.js';
const kinds: Record<string, Kind> = { actor: 'Actor', journey: 'Journey', 'use-case': 'UseCase', rule: 'BusinessRule', term: 'Term', requirement: 'Requirement', behavior: 'Behavior' };
export function migrateLegacy(root: string, assets: string, dryRun: boolean) {
  root = resolve(root);
  if (existsSync(resolve(root, 'intent.config.yaml'))) throw new IntentError('ALREADY_MIGRATED', 'intent.config.yaml already exists.');
  const build = () => {
    const p = loadProduct(root); requireValid(p);
    if (existsSync(safePath(root, '.prodshape/pending.json'))) throw new IntentError('LEGACY_RECOVERY_REQUIRED', 'Recover the legacy transaction first.');
    const files = new Map<string, string>();
    for (const item of p.items) {
      const kind = kinds[item.meta.type]!, body = item.body;
      const spec = kind === 'BusinessRule' ? { profile: 'sbvr-core/v1', statement: body }
        : kind === 'Term' ? { profile: 'sbvr-core/v1', definition: body }
        : kind === 'Requirement' ? { profile: 'reqif-core/v1', category: 'functional', statement: body, acceptance: ['Revisar e definir critérios verificáveis após a migração.'] }
        : kind === 'Behavior' ? { profile: 'behavior-core/v1', ...item.meta.behavior }
        : { profile: 'product-core/v1', description: body };
      const links = edges([item]).map(e => ({ relation: e.relation === 'references' ? 'related-to' : e.relation, target: e.to }));
      files.set(`intent-product/${kind}/${item.meta.id}.yaml`, stringify({ apiVersion: API_VERSION, kind, metadata: { id: item.meta.id, title: item.meta.title, status: 'draft' }, spec, links }));
    }
    files.set('intent.config.yaml', stringify({ apiVersion: API_VERSION, name: p.config.name, language: 'pt', product: 'intent-product', policies: { requireCitations: false } }));
    files.set('.intent/.gitignore', 'write.lock\ncache/\n');
    const report = { version: 1, mode: 'additive-copy', legacyConfig: 'prodshape.json', legacySnapshots: '.prodshape/snapshots', idMap: p.items.map(i => ({ id: i.meta.id, legacyDigest: i.digest, legacyFile: i.file, nativeFile: `intent-product/${kinds[i.meta.type]}/${i.meta.id}.yaml` })), notes: ['All migrated artifacts are draft.', 'Requirement category and acceptance are provisional and require human review.', 'Narrative rules need structured formulation before strict approval.', 'Old citations retain old digests and use prd legacy citations check.', 'This migration does not import or parse any XML.'] };
    files.set('.intent/migrations/prodshape-v0.json', JSON.stringify(report, null, 2));
    for (const path of files.keys()) if (existsSync(safePath(root, path))) throw new IntentError('MIGRATION_CONFLICT', path);
    if (!dryRun) {
      const written: string[] = [];
      try {
        // Config is the commit marker and is written last; legacy sources never change.
        for (const [path, text] of [...files].sort(([a], [b]) => a === 'intent.config.yaml' ? 1 : b === 'intent.config.yaml' ? -1 : a.localeCompare(b))) { writeAtomic(safePath(root, path), text); written.push(path); }
      } catch (e) { for (const path of written.reverse()) rmSync(safePath(root, path), { force: true }); throw e; }
    }
    return { dryRun, writes: [...files.keys()], ...report };
  };
  return dryRun ? build() : withLock(root, build);
}
