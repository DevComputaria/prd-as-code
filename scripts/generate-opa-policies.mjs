import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { generateDecisionRego, opaPackageName } from '../dist/infrastructure/opa/rego-generator.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(
  repositoryRoot,
  process.argv[2] ?? 'examples/transfer/product/decisions/DEC-001.yaml',
);
const targetDirectory = resolve(repositoryRoot, process.argv[3] ?? 'opa/policies');
const artifact = parse(readFileSync(sourcePath, 'utf8'));

if (artifact?.kind !== 'Decision' || typeof artifact.metadata?.id !== 'string' || !artifact.spec) {
  throw new Error(`${sourcePath} is not a Decision artifact.`);
}

const packageName = opaPackageName(artifact.metadata.id);
const fileName = `${packageName.split('.').at(-1)}.rego`;
const targetPath = resolve(targetDirectory, fileName);

mkdirSync(targetDirectory, { recursive: true });
writeFileSync(targetPath, generateDecisionRego(artifact.metadata.id, artifact.spec), 'utf8');
process.stdout.write(`Generated ${targetPath}\n`);
