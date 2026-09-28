import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { stringify } from 'yaml';
import { API_VERSION, IntentError } from '../../domain/model.js';
import { safePath, writeAtomic } from '../filesystem/workspace.js';
function tree(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? tree(resolve(dir, e.name)) : [resolve(dir, e.name)]); }
export function initialize(root: string, assets: string, options: { name: string; language: 'pt' | 'en'; ai: 'copilot' | 'none' }) {
  root = resolve(root); if (!options.name.trim()) throw new IntentError('INVALID_NAME', 'Product name required.');
  const files = new Map<string, string>();
  for (const [source, prefix] of [[resolve(assets, 'templates/product'), 'product'], [resolve(assets, 'framework'), 'framework'], ...(options.ai === 'copilot' ? [[resolve(assets, 'templates/copilot'), '.github']] : [])] as [string, string][]) {
    for (const file of tree(source)) {
      if (file.endsWith('.feature.en') || file.endsWith('.feature.pt')) { if (!file.endsWith('.' + options.language)) continue; }
      const name = relative(source, file).replaceAll('\\', '/').replace(/\.template$/, '').replace(/\.feature\.(pt|en)$/, '.feature');
      files.set(prefix + '/' + name, readFileSync(file, 'utf8'));
    }
  }
  files.set('intent.config.yaml', stringify({ apiVersion: API_VERSION, name: options.name, language: options.language, product: 'product', policies: { requireCitations: false } }));
  files.set('.intent/.gitignore', 'write.lock\ncache/\n');
  // Profile-scoped editor association; refuse to overwrite existing workspace settings.
  if (!existsSync(resolve(root, '.vscode/settings.json'))) files.set('.vscode/settings.json', JSON.stringify({ 'yaml.schemas': { './framework/schemas/artifact.schema.json': ['product/**/*.yaml', 'product/**/*.yml'], './framework/schemas/config.schema.json': 'intent.config.yaml' } }, null, 2));
  for (const file of files.keys()) if (existsSync(safePath(root, file))) throw new IntentError('INIT_CONFLICT', `Refusing to overwrite ${file}. Nothing was written.`);
  mkdirSync(root, { recursive: true }); const written: string[] = [];
  try { for (const [file, text] of files) { writeAtomic(safePath(root, file), text); written.push(file); } }
  catch (e) { for (const file of written.reverse()) rmSync(safePath(root, file), { force: true }); throw e; }
  return { root, files: files.size, ai: options.ai, language: options.language };
}
