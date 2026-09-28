export const API_VERSION = 'intent.gitreverse/v1alpha1';
export const PREFIX = {
  Actor: 'ACT', Journey: 'JRN', UseCase: 'UC', Term: 'TERM', BoundedContext: 'CTX',
  FactType: 'FACT', BusinessRule: 'BR', Requirement: 'REQ', Decision: 'DEC',
  Process: 'PROC', Behavior: 'BEH', Evidence: 'EVD', OpenQuestion: 'Q',
} as const;
export type Kind = keyof typeof PREFIX;
export interface Link { relation: string; target: string }
export interface Artifact {
  apiVersion: typeof API_VERSION;
  kind: Kind;
  metadata: { id: string; title: string; status: 'draft' | 'active' | 'deprecated' };
  spec: Record<string, unknown>;
  links?: Link[];
}
export interface SourceFile { path: string; text: string }
export interface SourceArtifact { artifact: Artifact; path: string; body?: string; digest: string }
export interface Diagnostic {
  code: string; severity: 'error' | 'warning' | 'unsupported'; message: string;
  file?: string; path?: string; line?: number; artifactId?: string;
}
export interface Edge { from: string; to: string; relation: string }
export interface Scenario { id: string; name: string; file: string; line: number; tags: string[]; steps: string[] }
export interface Model { artifacts: SourceArtifact[]; scenarios: Scenario[]; edges: Edge[]; diagnostics: Diagnostic[]; baseline: string }
export interface Configuration {
  apiVersion: typeof API_VERSION; name: string; language: 'pt' | 'en'; product: string;
  policies: { requireCitations: boolean };
}
export class IntentError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); this.name = 'IntentError'; }
}
export const isRecord = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
export function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(sortedJson).join(',') + ']';
  if (isRecord(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + sortedJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function canonical(source: Pick<SourceArtifact, 'artifact' | 'body'>): string {
  return sortedJson({ canonicalization: 'intent/v1', artifact: source.artifact, body: source.body ?? '' });
}
