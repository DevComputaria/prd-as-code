import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

test('canonical package identity is used in package metadata', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.name, '@devcomputaria/prd-as-code');
  assert.equal(lock.name, '@devcomputaria/prd-as-code');
  assert.equal(lock.packages[''].name, '@devcomputaria/prd-as-code');
});

test('canonical apiVersion and schema IDs are used in generated schemas', () => {
  const schemaDir = join(root, 'framework', 'schemas');
  for (const file of readdirSync(schemaDir).filter(name => name.endsWith('.schema.json'))) {
    const schema = JSON.parse(readFileSync(join(schemaDir, file), 'utf8'));
    if (schema.$id) assert.match(schema.$id, /^https:\/\/prd\.devcomputaria\/schemas\//);
    const asText = JSON.stringify(schema);
    assert.ok(asText.includes('prd.devcomputaria/v1alpha1'), file);
    assert.ok(!asText.includes('intent.gitreverse/v1alpha1'), file);
    assert.ok(!asText.includes('gitreverse.dev/schemas'), file);
  }
});

test('public repository surfaces do not expose deprecated public identity strings', () => {
  const banned = [
    '@marcialwushu/prd-as-code',
    'marcialwushu-prd-as-code',
    'intent.gitreverse/v1alpha1',
    'gitreverse.dev/schemas',
  ];
  const surfaces = [
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'package.json',
    'package-lock.json',
    'docs',
    'framework',
    'templates',
    'examples',
    'scripts/generate-schemas.py',
    'src/domain/model.ts',
  ];
  const files = [];
  for (const surface of surfaces) {
    const full = join(root, surface);
    if (!existsSync(full)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full).filter(path => /\.(md|json|ya?ml|ts|py)$/i.test(path)));
    else files.push(full);
  }
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    for (const token of banned) {
      assert.ok(!text.includes(token), `${token} found in ${relative(root, path)}`);
    }
  }
});

test('prohibited phrase is absent from visible public documentation', () => {
  const phrase = 'criado nesta conversa';
  const docs = [join(root, 'README.md'), join(root, 'CHANGELOG.md'), ...walk(join(root, 'docs')).filter(path => path.endsWith('.md'))];
  for (const path of docs) {
    const text = readFileSync(path, 'utf8').toLowerCase();
    assert.ok(!text.includes(phrase), `${phrase} found in ${relative(root, path)}`);
  }
});
