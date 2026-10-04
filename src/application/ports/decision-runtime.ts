import type { DecisionSpec, Scalar } from '../../domain/decisions.js';

export interface DecisionRuntimeRequest {
  decisionId: string;
  spec: DecisionSpec;
  input: Record<string, unknown>;
}

export interface DecisionRuntimeResult {
  value: Scalar;
  ruleId: string;
}

export type DecisionRuntimeOutcome =
  | { ok: true; result: DecisionRuntimeResult }
  | { ok: false; error: Error };

export interface DecisionRuntime {
  readonly name: string;
  evaluate(request: DecisionRuntimeRequest): Promise<DecisionRuntimeResult>;
  evaluateBatch?(requests: DecisionRuntimeRequest[]): Promise<DecisionRuntimeOutcome[]>;
  version?(): string | undefined;
}
