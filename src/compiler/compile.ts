import { digest } from '../domain/digest.js';
import { Ajv } from 'ajv';
import { parseDocument } from 'yaml';
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import type { FeatureChild, RuleChild, Tag } from '@cucumber/messages';
import { canonical, isRecord, sortedJson } from '../domain/model.js';
import type { Artifact, Diagnostic, Model, Scenario, SourceArtifact, SourceFile } from '../domain/model.js';
import { inspectSemantics } from './semantics.js';
import type { Compiler } from '../application/ports/compiler.js';
export function yaml(text: string): unknown {
  const doc = parseDocument(text.replace(/\r\n?/g, '\n'), { uniqueKeys: true, strict: true });
  if (doc.errors.length || doc.warnings.length) throw new Error([...doc.errors, ...doc.warnings].map(e => e.message).join('; '));
  return doc.toJS({ maxAliasCount: 0 });
}
export function createCompiler(schemas: Record<string, object>): Compiler {
  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  const validators = new Map(Object.entries(schemas).map(([k, v]) => [k, ajv.compile(v)]));
  return { compile(files: SourceFile[]): Model {
    const artifacts: SourceArtifact[] = [], scenarios: Scenario[] = [], diagnostics: Diagnostic[] = [];
    for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
      try {
        if (file.path.endsWith('.feature')) {
          const document = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher()).parse(file.text);
          if (!document.feature) throw new Error('Expected a Gherkin Feature/Funcionalidade.');
          function children(entries: readonly (FeatureChild | RuleChild)[], inherited: readonly Tag[], background: string[]) {
            const localBackground = entries.flatMap(e => e.background?.steps.map(s => s.text) ?? []);
            for (const child of entries) {
              if ('rule' in child && child.rule) children(child.rule.children, [...inherited, ...child.rule.tags], [...background, ...localBackground]);
              if (child.scenario) {
                const s = child.scenario, tags = [...inherited, ...s.tags].map(t => t.name);
                const ids = tags.filter(t => t.startsWith('@scenario_'));
                if (ids.length !== 1 || !/^@scenario_SCN-[A-Za-z0-9][A-Za-z0-9-]*$/.test(ids[0]!)) throw new Error(`Scenario at line ${s.location.line} requires exactly one @scenario_SCN-... tag.`);
                scenarios.push({ id: ids[0]!.slice(10), name: s.name, file: file.path, line: s.location.line, tags, steps: [...background, ...localBackground, ...s.steps.map(x => x.text)] });
                if (s.examples.length) diagnostics.push({ code: 'GHERKIN_OUTLINE_NOT_BOUND', severity: 'unsupported', file: file.path, line: s.location.line, message: 'Scenario Outline is parsed but row-level execution bindings are not implemented in v0.2.' });
              }
            }
          }
          children(document.feature.children, document.feature.tags, []);
          continue;
        }
        const normalized = file.text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
        let value: unknown, body: string | undefined;
        if (file.path.endsWith('.md')) {
          const m = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(normalized);
          if (!m) throw new Error('Product Markdown requires artifact front matter. Keep supporting docs outside product/.');
          value = yaml(m[1]!); body = m[2]!.replace(/^\n+|\n+$/g, '');
        } else value = yaml(normalized);
        const validator = isRecord(value) && typeof value.kind === 'string' ? validators.get(value.kind) : undefined;
        if (!validator) throw new Error('Unknown or missing artifact kind. See framework/schemas/.');
        if (!validator(value)) {
          for (const e of validator.errors ?? []) diagnostics.push({ code: 'SCHEMA_INVALID', severity: 'error', file: file.path, path: e.instancePath || '/', message: e.message ?? 'Invalid schema' });
          continue;
        }
        const source = { artifact: value as Artifact, path: file.path, body, digest: '' };
        source.digest = digest(canonical(source)); artifacts.push(source);
      } catch (e) { diagnostics.push({ code: 'PARSE_ERROR', severity: 'error', file: file.path, message: (e as Error).message }); }
    }
    const semantics = inspectSemantics(artifacts, scenarios);
    diagnostics.push(...semantics.diagnostics);
    if (!artifacts.length) diagnostics.push({ code: 'EMPTY_PRODUCT', severity: 'error', message: 'No valid product artifacts found.' });
    const baseline = digest(sortedJson(files.map(f => ({ path: f.path, digest: digest(f.text) })).sort((a, b) => a.path.localeCompare(b.path))));
    return { artifacts, scenarios, edges: semantics.edges, diagnostics, baseline };
  } };
}
