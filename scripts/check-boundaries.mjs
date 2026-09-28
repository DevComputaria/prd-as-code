import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(resolve(dir, e.name)) : [resolve(dir, e.name)]);
let violations = 0;
for (const layer of ['domain', 'application']) for (const file of files(`src/${layer}`)) {
  const text = readFileSync(file, 'utf8');
  for (const [, target] of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const forbidden = ['infrastructure', 'interfaces', 'legacy', 'compiler'].some(name => resolve(dirname(file), target).startsWith(resolve('src', name) + '/')) || (layer === 'domain' && resolve(dirname(file), target).startsWith(resolve('src/application') + '/')) || target.includes('bootstrap') || /node:(fs|child_process|http|https|net)/.test(target);
    if (forbidden) { console.error(`${file}: forbidden dependency ${target}`); violations++; }
  }
}
if (violations) process.exitCode = 1;
else console.log('Domain/application dependency boundaries passed.');
