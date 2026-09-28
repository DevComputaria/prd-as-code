export const TYPES = ['actor', 'journey', 'use-case', 'rule', 'term', 'requirement', 'behavior'] as const;
export type ItemType = typeof TYPES[number];
export const PREFIX: Record<ItemType, string> = { actor: 'ACT', journey: 'JRN', 'use-case': 'UC', rule: 'BR', term: 'TERM', requirement: 'REQ', behavior: 'BEH' };
export const RELATIONS = ['uses', 'depends-on', 'governed-by', 'performed-by', 'defines', 'satisfies', 'verifies', 'contains', 'related-to'] as const;
export type Relation = typeof RELATIONS[number];
export interface Metadata {
  id: string;
  type: ItemType;
  title: string;
  status: 'draft' | 'active' | 'deprecated';
  relations: Partial<Record<Relation, string[]>>;
  behavior?: { given: string[]; when: string[]; then: string[] };
}
export interface Item { meta: Metadata; body: string; file: string; digest: string }
export interface Issue { code: string; message: string; file?: string; id?: string }
export interface Config { schemaVersion: 1; name: string; docs: string }
export interface Product { root: string; config: Config; items: Item[]; issues: Issue[] }
export interface Edge { from: string; to: string; relation: string }
export interface Graph { nodes: { id: string; type: ItemType; title: string; digest: string }[]; edges: Edge[] }
export type CitationStatus = 'current' | 'stale' | 'tampered' | 'unresolved';
export interface CitationResult { file: string; line: number; id?: string; digest?: string; status: CitationStatus; reason: string }
export class ProdshapeError extends Error {
  constructor(message: string, public code = 'OPERATION_FAILED', public details?: unknown) { super(message); this.name = 'ProdshapeError'; }
}
