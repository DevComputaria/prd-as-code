import { evaluateDecision } from '../../domain/decisions.js';
import type { DecisionRuntime, DecisionRuntimeRequest } from '../../application/ports/decision-runtime.js';

export class ReferenceDecisionRuntime implements DecisionRuntime {
  readonly name = 'reference';

  async evaluate(request: DecisionRuntimeRequest) {
    return evaluateDecision(request.spec, request.input);
  }
}
