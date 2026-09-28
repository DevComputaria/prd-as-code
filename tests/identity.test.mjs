import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
    'criado nesta conversa',
  ];
  const files = walk(root).filter(path => {
    if (relative(root, path).startsWith('tests/')) return false;
    return /\.(md|json|ya?ml|ts|py)$/i.test(path);
  });
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    for (const token of banned) {
      assert.ok(!text.includes(token), `${token} found in ${relative(root, path)}`);
    }
  }
});
