import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createCompiler } from './compiler/compile.js';
import { createWorkspace } from './infrastructure/filesystem/workspace.js';
import { ProductService } from './application/product-service.js';
export const packageRoot = fileURLToPath(new URL('../', import.meta.url));
export function services(root: string): ProductService {
  const dir = resolve(packageRoot, 'framework/schemas');
  const schemas = Object.fromEntries(readdirSync(dir).filter(f => /^[A-Z].*\.schema\.json$/.test(f)).map(f => [f.replace('.schema.json', ''), JSON.parse(readFileSync(resolve(dir, f), 'utf8'))]));
  return new ProductService(createWorkspace(root, JSON.parse(readFileSync(resolve(dir, 'config.schema.json'), 'utf8'))), createCompiler(schemas));
}
