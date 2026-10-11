import { digest } from '../domain/digest.js';
import { Ajv } from 'ajv';
import { parseDocument, LineCounter } from 'yaml';
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import type { FeatureChild, RuleChild, Tag } from '@cucumber/messages';
import { canonical, isRecord, sortedJson } from '../domain/model.js';
import type { Artifact, Diagnostic, Model, Scenario, SourceArtifact, SourceFile } from '../domain/model.js';
import { inspectSemantics } from './semantics.js';
import type { Compiler } from '../application/ports/compiler.js';

export function parseYamlDocument(text: string) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text.replace(/\r\n?/g, '\n'), { uniqueKeys: true, strict: true, lineCounter });
  if (doc.errors.length || doc.warnings.length) {
    const err = [...doc.errors, ...doc.warnings][0]!;
    const line = err.linePos?.[0]?.line;
    const error = new Error(err.message) as Error & { line?: number };
    if (line) error.line = line;
    throw error;
  }
  return { value: doc.toJS({ maxAliasCount: 0 }), doc, lineCounter };
}

export function yaml(text: string): unknown {
  return parseYamlDocument(text).value;
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
                const baseId = ids[0]!.slice(10);
                const baseSteps = [...background, ...localBackground, ...s.steps.map(x => x.text)];
                scenarios.push({ id: baseId, name: s.name, file: file.path, line: s.location.line, tags, steps: baseSteps });
                if (s.examples.length) {
                  let rowNum = 1;
                  for (const example of s.examples) {
                    const headers = example.tableHeader?.cells.map(c => c.value) ?? [];
                    for (const row of example.tableBody) {
                      const values = row.cells.map(c => c.value);
                      const rowSteps = [...background, ...localBackground, ...s.steps.map(x => {
                        let text = x.text;
                        headers.forEach((h, i) => { if (values[i] !== undefined) text = text.replace(new RegExp(`<${h}>`, 'g'), values[i]!); });
                        return text;
                      })];
                      scenarios.push({ id: `${baseId}#${rowNum}`, name: `${s.name} (Row ${rowNum})`, file: file.path, line: row.location.line, tags, steps: rowSteps });
                      rowNum++;
                    }
                  }
                }
              }
            }
          }
          children(document.feature.children, document.feature.tags, []);
          continue;
        }
        const normalized = file.text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
        let value: unknown, body: string | undefined, parsedDoc: ReturnType<typeof parseYamlDocument> | undefined, lineOffset = 0;
        if (file.path.endsWith('.md')) {
          const m = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(normalized);
          if (!m) throw new Error('Product Markdown requires artifact front matter. Keep supporting docs outside product/.');
          parsedDoc = parseYamlDocument(m[1]!);
          value = parsedDoc.value; body = m[2]!.replace(/^\n+|\n+$/g, '');
          lineOffset = 1; // Front matter begins after the opening '---' at line 1
        } else {
          parsedDoc = parseYamlDocument(normalized);
          value = parsedDoc.value;
        }
        const validator = isRecord(value) && typeof value.kind === 'string' ? validators.get(value.kind) : undefined;
        if (!validator) throw new Error('Unknown or missing artifact kind. See framework/schemas/.');
        if (!validator(value)) {
          for (const e of validator.errors ?? []) {
            let line: number | undefined;
            if (parsedDoc) {
              const segments = e.instancePath.split('/').filter(Boolean).map(p => /^\d+$/.test(p) ? Number(p) : p);
              let node = parsedDoc.doc.getIn(segments, true) as { range?: [number, number] } | null;
              if (!node && segments.length) node = parsedDoc.doc.getIn(segments.slice(0, -1), true) as { range?: [number, number] } | null;
              if (node?.range) line = parsedDoc.lineCounter.linePos(node.range[0]).line + lineOffset;
            }
            diagnostics.push({ code: 'SCHEMA_INVALID', severity: 'error', file: file.path, line, path: e.instancePath || '/', message: e.message ?? 'Invalid schema' });
          }
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
