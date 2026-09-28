import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProdshapeError } from './types.js';

export const read = (file: string): string => readFileSync(file, 'utf8');
export function json<T = unknown>(file: string): T {
  try { return JSON.parse(read(file)) as T; } catch { throw new ProdshapeError(`Cannot read valid JSON: ${file}`, 'INVALID_JSON'); }
}
export function inside(root: string, path: string): string {
  const base = resolve(root), target = resolve(base, path), rel = relative(base, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new ProdshapeError(`Path must be inside the product directory: ${path}`, 'UNSAFE_PATH');
  // Refuse symlinks on every existing component, including the supplied root.
  let cursor = target;
  while (true) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new ProdshapeError(`Symlinks are not supported: ${cursor}`, 'UNSAFE_PATH');
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return target;
}
export function atomicWrite(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, content, { flag: 'wx' }); renameSync(temp, file); }
  finally { rmSync(temp, { force: true }); }
}
export function exclusiveWrite(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, { flag: 'wx' });
}
export function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  if (lstatSync(root).isSymbolicLink()) throw new ProdshapeError(`Symlinks are not supported: ${root}`, 'UNSAFE_PATH');
  const out: string[] = [];
  for (const e of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (['node_modules', '.git', '.prodshape', 'dist'].includes(e.name)) continue;
    const file = join(root, e.name);
    if (e.isSymbolicLink()) throw new ProdshapeError(`Symlinks are not supported: ${file}`, 'UNSAFE_PATH');
    if (e.isDirectory()) out.push(...walk(file));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(file);
  }
  return out;
}
export function findRoot(start: string): string {
  let dir = resolve(start);
  if (!existsSync(dir)) throw new ProdshapeError(`Directory does not exist: ${dir}`, 'NOT_FOUND');
  dir = realpathSync(dir);
  while (!existsSync(join(dir, 'prodshape.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new ProdshapeError('No prodshape.json found. Run "prodshape init <directory>" first, or pass --root.', 'NOT_A_PRODUCT');
    dir = parent;
  }
  return dir;
}
export function withLock<T>(root: string, fn: () => T): T {
  const path = inside(root, '.prodshape/write.lock');
  try { exclusiveWrite(path, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new ProdshapeError('Another write is in progress. If a process crashed, inspect and remove .prodshape/write.lock before retrying.', 'LOCKED'); throw e; }
  try { return fn(); } finally { rmSync(path, { force: true }); }
}
