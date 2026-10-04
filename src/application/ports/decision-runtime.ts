import type { DecisionSpec, Scalar } from '../../domain/decisions.js';

export interface DecisionRuntimeRequest {
  decisionId: string;
  spec: DecisionSpec;
  input: Record<string, Scalar>;
}

export interface DecisionRuntimeResult {
  value: Scalar;
  ruleId: string;
}

export interface DecisionRuntime {
  readonly name: string;
  evaluate(request: DecisionRuntimeRequest): Promise<DecisionRuntimeResult>;
}
