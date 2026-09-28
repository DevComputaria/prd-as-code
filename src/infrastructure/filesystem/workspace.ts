import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Ajv } from 'ajv';
import { yaml } from '../../compiler/compile.js';
import { IntentError } from '../../domain/model.js';
import type { Configuration, SourceFile } from '../../domain/model.js';
import type { Workspace } from '../../application/ports/workspace.js';
export function safePath(root: string, path: string): string {
  const base = resolve(root), target = resolve(base, path), rel = relative(base, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new IntentError('UNSAFE_PATH', `Path must be inside workspace: ${path}`);
  let cursor = target;
  while (true) {
    try { if (lstatSync(cursor).isSymbolicLink()) throw new IntentError('UNSAFE_PATH', `Symlink not allowed: ${cursor}`); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  return target;
}
export function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true }); const tmp = path + '.' + randomUUID() + '.tmp';
  try { writeFileSync(tmp, text, { flag: 'wx' }); renameSync(tmp, path); } finally { rmSync(tmp, { force: true }); }
}
export function discover(start: string): string {
  let root = resolve(start);
  while (!existsSync(resolve(root, 'intent.config.yaml'))) {
    const parent = dirname(root); if (parent === root) throw new IntentError('NOT_A_PRODUCT', 'No intent.config.yaml found. Use prd init <directory> or prd migrate --root <legacy-product>.'); root = parent;
  }
  return root;
}
export function listFiles(root: string, sub: string, suffixes: string[]): string[] {
  const base = sub ? safePath(root, sub) : root;
  if (!existsSync(base)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', '.git', '.intent', '.prodshape', 'dist', 'framework'].includes(entry.name)) continue;
    const path = relative(root, resolve(base, entry.name)).split(sep).join('/');
    safePath(root, path);
    if (entry.isDirectory()) out.push(...listFiles(root, path, suffixes));
    else if (entry.isFile() && suffixes.some(s => entry.name.endsWith(s))) out.push(path);
  }
  return out;
}
export function createWorkspace(root: string, configSchema: object): Workspace {
  root = resolve(root);
  const validate = new Ajv({ allErrors: true }).compile(configSchema);
  const w: Workspace = {
    root,
    read: path => { const file = safePath(root, path); return existsSync(file) ? readFileSync(file, 'utf8') : null; },
    write: (path, content) => writeAtomic(safePath(root, path), content),
    remove: path => rmSync(safePath(root, path), { force: true }),
    config: () => {
      const text = w.read('intent.config.yaml'); if (text === null) throw new IntentError('NOT_A_PRODUCT', 'Missing intent.config.yaml.');
      const data = yaml(text);
      if (!validate(data)) throw new IntentError('CONFIG_INVALID', 'Invalid intent.config.yaml.', validate.errors);
      const config = data as Configuration;
      safePath(root, config.product);
      if (config.product.split(/[\\/]/).some(s => ['.intent', '.prodshape', '.git', 'node_modules', 'dist', 'framework'].includes(s))) throw new IntentError('CONFIG_INVALID', 'Reserved product path.');
      return config;
    },
    productFiles: () => listFiles(root, w.config().product, ['.yaml', '.yml', '.md', '.feature']).map(path => ({ path, text: w.read(path)! })),
    markdownFiles: () => listFiles(root, '', ['.md']).filter(p => !p.startsWith('.github/')).map(path => ({ path, text: w.read(path)! })),
    lock: fn => {
      const path = safePath(root, '.intent/write.lock'); mkdirSync(dirname(path), { recursive: true });
      try { writeFileSync(path, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: 'wx' }); }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new IntentError('LOCKED', 'Writer lock exists. Check for a running process before removing a stale .intent/write.lock.'); throw e; }
      try { return fn(); } finally { rmSync(path, { force: true }); }
    },
  };
  return w;
}
