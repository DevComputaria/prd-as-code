import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { IntentError, isRecord } from '../../domain/model.js';
import type { Scalar } from '../../domain/decisions.js';
import type {
  DecisionRuntime,
  DecisionRuntimeRequest,
  DecisionRuntimeResult,
} from '../../application/ports/decision-runtime.js';
import { generateDecisionRego, opaPackageName } from './rego-generator.js';

function isScalar(value: unknown): value is Scalar {
  return typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value));
}

export class OpaDecisionRuntime implements DecisionRuntime {
  readonly name = 'opa';

  constructor(readonly binary = process.env.PRD_OPA_BINARY || 'opa') {}

  async evaluate(request: DecisionRuntimeRequest): Promise<DecisionRuntimeResult> {
    const dir = mkdtempSync(join(tmpdir(), 'prd-opa-'));
    const policy = join(dir, 'decision.rego');

    try {
      writeFileSync(policy, generateDecisionRego(request.decisionId, request.spec), 'utf8');
      const query = `data.${opaPackageName(request.decisionId)}.result`;
      const result = spawnSync(
        this.binary,
        [
          'eval',
          '--format=json',
          '--strict',
          '--fail',
          '--stdin-input',
          '--data',
          policy,
          query,
        ],
        {
          input: JSON.stringify(request.input),
          encoding: 'utf8',
          windowsHide: true,
        },
      );

      if (result.error) {
        const code = (result.error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          throw new IntentError(
            'OPA_RUNTIME_UNAVAILABLE',
            `OPA executable not found: ${this.binary}. Install OPA or set PRD_OPA_BINARY.`,
          );
        }
        throw result.error;
      }

      if (result.status !== 0) {
        throw new IntentError(
          'OPA_EVAL_FAILED',
          (result.stderr || result.stdout || 'OPA evaluation failed.').trim(),
        );
      }

      let document: unknown;
      try {
        document = JSON.parse(result.stdout);
      } catch {
        throw new IntentError('OPA_INVALID_OUTPUT', 'OPA returned invalid JSON.');
      }

      if (!isRecord(document) || !Array.isArray(document.result)) {
        throw new IntentError('OPA_INVALID_OUTPUT', 'OPA result array is missing.');
      }
      const first = document.result[0];
      if (!isRecord(first) || !Array.isArray(first.expressions)) {
        throw new IntentError('OPA_INVALID_OUTPUT', 'OPA expressions are missing.');
      }
      const expression = first.expressions[0];
      if (!isRecord(expression) || !isRecord(expression.value)) {
        throw new IntentError('OPA_INVALID_OUTPUT', 'OPA decision result is missing.');
      }

      const value = expression.value.value;
      const ruleId = expression.value.ruleId;
      if (!isScalar(value) || typeof ruleId !== 'string') {
        throw new IntentError('OPA_INVALID_OUTPUT', 'OPA decision result has invalid value or ruleId.');
      }
      return { value, ruleId };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
