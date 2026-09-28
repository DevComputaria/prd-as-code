/** Future adapter for real application tests. The shipped runner evaluates decision models only. */
export interface EvidenceRunner {
  run(input: { scenarioIds: string[]; modelDigest: string; commit: string }): Promise<{
    scope: 'application'; producer: string; executedAt: string;
    results: { scenarioId: string; outcome: 'passed' | 'failed' | 'inconclusive' }[];
  }>;
}
