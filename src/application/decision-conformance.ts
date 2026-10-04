import { evaluateDecision } from '../domain/decisions.js';
import type { DecisionSpec, Scalar } from '../domain/decisions.js';
import { IntentError, sortedJson } from '../domain/model.js';
import type {
  DecisionRuntime,
  DecisionRuntimeOutcome,
  DecisionRuntimeRequest,
  DecisionRuntimeResult,
} from './ports/decision-runtime.js';

export interface DecisionConformanceCase {
  id: string;
  kind: 'declared' | 'parity';
  scenario?: string;
  input: Record<string, unknown>;
  expected?: Scalar;
  expectedError?: string;
  reference?: DecisionRuntimeResult;
  runtime?: DecisionRuntimeResult;
  referenceError?: string;
  runtimeError?: string;
  passed: boolean;
  error?: string;
}

export interface DecisionConformanceResult {
  decision: string;
  runtime: string;
  runtimeVersion?: string;
  parity: boolean;
  passed: boolean;
  cases: DecisionConformanceCase[];
  matched: number;
  divergent: number;
}

interface ConformanceProbe {
  id: string;
  kind: 'declared' | 'parity';
  scenario?: string;
  spec: DecisionSpec;
  input: Record<string, unknown>;
  expected?: Scalar;
  expectedError?: string;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function errorCode(error: Error): string {
  return error instanceof IntentError ? error.code : error.name;
}

function scalarEqual(left: Scalar, right: Scalar): boolean {
  return sortedJson(left) === sortedJson(right);
}

function settleReference(probe: ConformanceProbe): DecisionRuntimeOutcome {
  try {
    return { ok: true, result: evaluateDecision(probe.spec, probe.input) };
  } catch (error) {
    return { ok: false, error: asError(error) };
  }
}

async function settleRuntime(
  runtime: DecisionRuntime,
  decisionId: string,
  probes: ConformanceProbe[],
): Promise<DecisionRuntimeOutcome[]> {
  const outcomes: Array<DecisionRuntimeOutcome | undefined> = new Array(probes.length);
  const groups = new Map<string, { index: number; request: DecisionRuntimeRequest }[]>();
  for (const [index, probe] of probes.entries()) {
    const key = sortedJson(probe.spec);
    const group = groups.get(key) ?? [];
    group.push({
      index,
      request: { decisionId, spec: probe.spec, input: probe.input },
    });
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (runtime.evaluateBatch) {
      const batch = await runtime.evaluateBatch(group.map(item => item.request));
      if (batch.length !== group.length) {
        throw new IntentError('RUNTIME_INVALID_OUTPUT', 'Runtime batch result count does not match.');
      }
      for (const [index, outcome] of batch.entries()) outcomes[group[index]!.index] = outcome;
    } else {
      const settled = await Promise.all(group.map(async item => {
        try {
          return { ok: true, result: await runtime.evaluate(item.request) } as const;
        } catch (error) {
          return { ok: false, error: asError(error) } as const;
        }
      }));
      for (const [index, outcome] of settled.entries()) outcomes[group[index]!.index] = outcome;
    }
  }

  return outcomes.map(outcome => outcome ?? ({
    ok: false,
    error: new IntentError('RUNTIME_INVALID_OUTPUT', 'Runtime returned no outcome.'),
  }));
}

function alternativeValue(
  input: { type: 'boolean' | 'number' | 'string' },
  current: Scalar,
): Scalar {
  if (input.type === 'boolean') return current !== true;
  if (input.type === 'number') return current === 0 ? 1 : 0;
  const candidate = '__PRD_PARITY_OUTSIDE_DOMAIN__';
  return current === candidate ? `${candidate}_2` : candidate;
}

function invalidOutputValue(spec: DecisionSpec): Scalar {
  if (!spec.output.values) {
    return spec.output.type === 'string' ? false : '__wrong_output_type__';
  }
  const candidates: Scalar[] = spec.output.type === 'boolean'
    ? [false, true]
    : spec.output.type === 'number'
      ? [0, -1, 1, 1.25, 9007199254740994]
      : ['__PRD_PARITY_OUTSIDE_DOMAIN__', '__PRD_PARITY_OUTSIDE_DOMAIN_2__'];
  return candidates.find(candidate => !spec.output.values!.includes(candidate)) ??
    (spec.output.type === 'string' ? false : '__wrong_output_type__');
}

function parityProbes(spec: DecisionSpec): ConformanceProbe[] {
  const seed = spec.cases[0]?.input;
  const firstInput = spec.inputs[0];
  if (!seed || !firstInput) return [];

  const missing = { ...seed } as Record<string, unknown>;
  delete missing[firstInput.name];
  const wrongType = {
    ...seed,
    [firstInput.name]: firstInput.type === 'string' ? false : '__wrong_type__',
  };
  const matchingRule = spec.rules.find(rule =>
    Object.entries(rule.when).every(([key, value]) => seed[key] === value));
  const overlapSpec: DecisionSpec = {
    ...spec,
    rules: matchingRule
      ? [...spec.rules, { ...matchingRule, id: '__PRD_PARITY_OVERLAP__' }]
      : [...spec.rules, { id: '__PRD_PARITY_OVERLAP__', when: {}, then: spec.rules[0]!.then }],
  };
  const domainSpec: DecisionSpec = {
    ...spec,
    inputs: spec.inputs.map((input, index) => index === 0
      ? { ...input, values: [seed[input.name] as Scalar] }
      : input),
  };
  const invalidOutput = invalidOutputValue(spec);
  const invalidOutputSpec: DecisionSpec = {
    ...spec,
    rules: spec.rules.map(rule => rule.id === matchingRule?.id
      ? { ...rule, then: invalidOutput }
      : rule),
  };

  return [
    {
      id: 'PARITY-EXTRA-INPUT',
      kind: 'parity',
      spec,
      input: { ...seed, __unexpected: true },
      expectedError: 'INVALID_INPUT',
    },
    {
      id: 'PARITY-MISSING-INPUT',
      kind: 'parity',
      spec,
      input: missing,
      expectedError: 'INVALID_INPUT',
    },
    {
      id: 'PARITY-WRONG-TYPE',
      kind: 'parity',
      spec,
      input: wrongType,
      expectedError: 'INVALID_INPUT',
    },
    {
      id: 'PARITY-OUTSIDE-DOMAIN',
      kind: 'parity',
      spec: domainSpec,
      input: {
        ...seed,
        [firstInput.name]: alternativeValue(firstInput, seed[firstInput.name] as Scalar),
      },
      expectedError: 'INVALID_INPUT',
    },
    {
      id: 'PARITY-GAP',
      kind: 'parity',
      spec: { ...spec, rules: [] },
      input: seed,
      expectedError: 'DECISION_GAP',
    },
    {
      id: 'PARITY-OVERLAP',
      kind: 'parity',
      spec: overlapSpec,
      input: seed,
      expectedError: 'DECISION_OVERLAP',
    },
    {
      id: 'PARITY-INVALID-OUTPUT',
      kind: 'parity',
      spec: invalidOutputSpec,
      input: seed,
      expectedError: 'INVALID_DECISION_OUTPUT',
    },
  ];
}

export async function conformDecision(
  decisionId: string,
  spec: DecisionSpec,
  runtime: DecisionRuntime,
  options: { parity?: boolean } = {},
): Promise<DecisionConformanceResult> {
  const probes: ConformanceProbe[] = [
    ...spec.cases.map(testCase => ({
      id: testCase.id,
      kind: 'declared' as const,
      scenario: testCase.scenario,
      spec,
      input: testCase.input,
      expected: testCase.expected,
    })),
    ...(options.parity ? parityProbes(spec) : []),
  ];
  const runtimeOutcomes = await settleRuntime(runtime, decisionId, probes);
  const cases = probes.map((probe, index): DecisionConformanceCase => {
    const reference = settleReference(probe);
    const candidate = runtimeOutcomes[index]!;
    if (probe.expectedError) {
      const referenceError = reference.ok ? undefined : errorCode(reference.error);
      const runtimeError = candidate.ok ? undefined : errorCode(candidate.error);
      return {
        id: probe.id,
        kind: probe.kind,
        scenario: probe.scenario,
        input: probe.input,
        expectedError: probe.expectedError,
        reference: reference.ok ? reference.result : undefined,
        runtime: candidate.ok ? candidate.result : undefined,
        referenceError,
        runtimeError,
        passed: referenceError === probe.expectedError && runtimeError === referenceError,
      };
    }

    const passed = reference.ok && candidate.ok && probe.expected !== undefined &&
      scalarEqual(reference.result.value, probe.expected) &&
      scalarEqual(candidate.result.value, reference.result.value) &&
      candidate.result.ruleId === reference.result.ruleId;
    return {
      id: probe.id,
      kind: probe.kind,
      scenario: probe.scenario,
      input: probe.input,
      expected: probe.expected,
      reference: reference.ok ? reference.result : undefined,
      runtime: candidate.ok ? candidate.result : undefined,
      referenceError: reference.ok ? undefined : errorCode(reference.error),
      runtimeError: candidate.ok ? undefined : errorCode(candidate.error),
      passed,
      error: reference.ok && candidate.ok
        ? undefined
        : [reference.ok ? undefined : reference.error.message, candidate.ok ? undefined : candidate.error.message]
          .filter(Boolean).join(' | '),
    };
  });

  const matched = cases.filter(testCase => testCase.passed).length;
  return {
    decision: decisionId,
    runtime: runtime.name,
    runtimeVersion: runtime.version?.(),
    parity: Boolean(options.parity),
    passed: cases.length > 0 && matched === cases.length,
    cases,
    matched,
    divergent: cases.length - matched,
  };
}
