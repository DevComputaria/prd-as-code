import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { IntentError, isRecord } from '../../domain/model.js';
import { validateDecisionInput } from '../../domain/decisions.js';
import type { DecisionSpec, Scalar } from '../../domain/decisions.js';
import type {
  DecisionRuntime,
  DecisionRuntimeOutcome,
  DecisionRuntimeRequest,
  DecisionRuntimeResult,
} from '../../application/ports/decision-runtime.js';
import { generateDecisionRego, opaPackageName } from './rego-generator.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const execFileAsync = promisify(execFile);

function isScalar(value: unknown): value is Scalar {
  return typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value));
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function evaluationOutcome(value: unknown): DecisionRuntimeOutcome {
  if (!isRecord(value) || typeof value.status !== 'string') {
    return { ok: false, error: new IntentError('OPA_INVALID_OUTPUT', 'OPA evaluation status is missing.') };
  }
  if (value.status === 'unique') {
    if (!isScalar(value.value) || typeof value.ruleId !== 'string') {
      return {
        ok: false,
        error: new IntentError('OPA_INVALID_OUTPUT', 'OPA decision result has invalid value or ruleId.'),
      };
    }
    return { ok: true, result: { value: value.value, ruleId: value.ruleId } };
  }
  if (value.status === 'invalid_input') {
    return {
      ok: false,
      error: new IntentError(
        'INVALID_INPUT',
        'Decision inputs must exactly match declared names, types, and domains.',
      ),
    };
  }
  if (value.status === 'invalid_output') {
    return {
      ok: false,
      error: new IntentError(
        'INVALID_DECISION_OUTPUT',
        'Decision output must match its declared type and domain.',
        { ruleId: typeof value.ruleId === 'string' ? value.ruleId : undefined },
      ),
    };
  }
  const ruleIds = Array.isArray(value.ruleIds)
    ? value.ruleIds.filter((item): item is string => typeof item === 'string')
    : [];
  if (value.status === 'gap') {
    return {
      ok: false,
      error: new IntentError('DECISION_GAP', 'UNIQUE decision matched 0 rows.', { ruleIds }),
    };
  }
  if (value.status === 'overlap') {
    return {
      ok: false,
      error: new IntentError(
        'DECISION_OVERLAP',
        `UNIQUE decision matched ${ruleIds.length} rows.`,
        { ruleIds },
      ),
    };
  }
  return {
    ok: false,
    error: new IntentError('OPA_INVALID_OUTPUT', `Unknown OPA evaluation status: ${value.status}.`),
  };
}

export class OpaDecisionRuntime implements DecisionRuntime {
  readonly name = 'opa';

  constructor(
    readonly binary = process.env.PRD_OPA_BINARY || 'opa',
    readonly policyPath?: string,
    readonly timeoutMs = Number(process.env.PRD_OPA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    readonly policyBaseline?: { decisionId: string; spec: DecisionSpec },
  ) {}

  version(): string | undefined {
    const result = spawnSync(this.binary, ['version'], {
      encoding: 'utf8',
      timeout: this.timeoutMs,
      windowsHide: true,
    });
    if (result.status !== 0) return undefined;
    return /^Version:\s*(.+)$/m.exec(result.stdout)?.[1]?.trim();
  }

  async evaluate(request: DecisionRuntimeRequest): Promise<DecisionRuntimeResult> {
    const [outcome] = await this.evaluateBatch([request]);
    if (!outcome) throw new IntentError('OPA_INVALID_OUTPUT', 'OPA returned no decision outcome.');
    if (!outcome.ok) throw outcome.error;
    return outcome.result;
  }

  async evaluateBatch(requests: DecisionRuntimeRequest[]): Promise<DecisionRuntimeOutcome[]> {
    if (requests.length === 0) return [];
    const first = requests[0]!;
    const policySource = generateDecisionRego(first.decisionId, first.spec);
    if (requests.some(request => request.decisionId !== first.decisionId ||
      generateDecisionRego(request.decisionId, request.spec) !== policySource)) {
      throw new IntentError(
        'OPA_BATCH_MISMATCH',
        'OPA batch requests must use the same decision id and specification.',
      );
    }

    const outcomes: Array<DecisionRuntimeOutcome | undefined> = new Array(requests.length);
    const valid: { index: number; input: Record<string, Scalar> }[] = [];
    for (const [index, request] of requests.entries()) {
      try {
        validateDecisionInput(request.spec, request.input);
        valid.push({ index, input: request.input });
      } catch (error) {
        outcomes[index] = { ok: false, error: asError(error) };
      }
    }
    if (valid.length === 0) return outcomes.map(outcome => outcome!);

    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'prd-opa-'));
    const baselineSource = this.policyBaseline
      ? generateDecisionRego(this.policyBaseline.decisionId, this.policyBaseline.spec)
      : undefined;
    const useCommittedPolicy = Boolean(this.policyPath) &&
      (baselineSource === undefined || baselineSource === policySource);
    const policy = useCommittedPolicy ? this.policyPath! : join(temporaryDirectory, 'decision.rego');
    const inputPath = join(temporaryDirectory, 'input.json');

    try {
      if (useCommittedPolicy) {
        if (readFileSync(this.policyPath!, 'utf8') !== policySource) {
          throw new IntentError(
            'OPA_POLICY_STALE',
            `Generated policy differs from ${this.policyPath}. Regenerate the committed OPA artifacts.`,
          );
        }
      } else {
        writeFileSync(policy, policySource, 'utf8');
      }
      writeFileSync(inputPath, JSON.stringify(valid.map(item => item.input)), 'utf8');

      const query = `data.${opaPackageName(first.decisionId)}.batch`;
      let stdout: string;
      try {
        const result = await execFileAsync(
          this.binary,
          ['eval', '--format=json', '--strict', '--input', inputPath, '--data', policy, query],
          {
            encoding: 'utf8',
            timeout: this.timeoutMs,
            maxBuffer: 10 * 1024 * 1024,
            windowsHide: true,
          },
        );
        stdout = result.stdout;
      } catch (error) {
        const failure = error as NodeJS.ErrnoException & {
          killed?: boolean;
          signal?: NodeJS.Signals;
          stdout?: string;
          stderr?: string;
        };
        const code = failure.code;
        if (code === 'ENOENT') {
          throw new IntentError(
            'OPA_RUNTIME_UNAVAILABLE',
            `OPA executable not found: ${this.binary}. Install OPA or set PRD_OPA_BINARY.`,
          );
        }
        if (code === 'ETIMEDOUT' || (failure.killed && failure.signal === 'SIGTERM')) {
          throw new IntentError(
            'OPA_EVAL_TIMEOUT',
            `OPA evaluation exceeded ${this.timeoutMs}ms.`,
          );
        }
        throw new IntentError(
          'OPA_EVAL_FAILED',
          (failure.stderr || failure.stdout || failure.message || 'OPA evaluation failed.').trim(),
        );
      }

      let document: unknown;
      try {
        document = JSON.parse(stdout);
      } catch {
        throw new IntentError('OPA_INVALID_OUTPUT', 'OPA returned invalid JSON.');
      }
      if (!isRecord(document) || !Array.isArray(document.result)) {
        throw new IntentError('OPA_INVALID_OUTPUT', 'OPA result array is missing.');
      }
      const firstResult = document.result[0];
      if (!isRecord(firstResult) || !Array.isArray(firstResult.expressions)) {
        throw new IntentError('OPA_INVALID_OUTPUT', 'OPA expressions are missing.');
      }
      const expression = firstResult.expressions[0];
      if (!isRecord(expression) || !Array.isArray(expression.value) ||
        expression.value.length !== valid.length) {
        throw new IntentError('OPA_INVALID_OUTPUT', 'OPA batch result is missing or incomplete.');
      }
      for (const [resultIndex, item] of expression.value.entries()) {
        outcomes[valid[resultIndex]!.index] = evaluationOutcome(item);
      }
      return outcomes.map(outcome => outcome ?? ({
        ok: false,
        error: new IntentError('OPA_INVALID_OUTPUT', 'OPA returned no decision outcome.'),
      }));
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
