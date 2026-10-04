import { evaluateDecision } from '../domain/decisions.js';
import type { DecisionSpec, Scalar } from '../domain/decisions.js';
import type { DecisionRuntime, DecisionRuntimeResult } from './ports/decision-runtime.js';

export interface DecisionConformanceCase {
  id: string;
  scenario?: string;
  input: Record<string, Scalar>;
  expected: Scalar;
  reference?: DecisionRuntimeResult;
  runtime?: DecisionRuntimeResult;
  passed: boolean;
  error?: string;
}

export interface DecisionConformanceResult {
  decision: string;
  runtime: string;
  passed: boolean;
  cases: DecisionConformanceCase[];
  matched: number;
  divergent: number;
}

export async function conformDecision(
  decisionId: string,
  spec: DecisionSpec,
  runtime: DecisionRuntime,
): Promise<DecisionConformanceResult> {
  const cases: DecisionConformanceCase[] = [];

  for (const testCase of spec.cases) {
    try {
      const reference = evaluateDecision(spec, testCase.input);
      const candidate = await runtime.evaluate({
        decisionId,
        spec,
        input: testCase.input,
      });
      const passed =
        Object.is(reference.value, testCase.expected) &&
        Object.is(candidate.value, reference.value) &&
        candidate.ruleId === reference.ruleId;

      cases.push({
        id: testCase.id,
        scenario: testCase.scenario,
        input: testCase.input,
        expected: testCase.expected,
        reference,
        runtime: candidate,
        passed,
      });
    } catch (error) {
      cases.push({
        id: testCase.id,
        scenario: testCase.scenario,
        input: testCase.input,
        expected: testCase.expected,
        passed: false,
        error: (error as Error).message,
      });
    }
  }

  const matched = cases.filter(c => c.passed).length;
  return {
    decision: decisionId,
    runtime: runtime.name,
    passed: cases.length > 0 && matched === cases.length,
    cases,
    matched,
    divergent: cases.length - matched,
  };
}
