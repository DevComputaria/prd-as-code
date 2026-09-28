/** Future integration contract. Local --by records are NOT authenticated approvals. */
export interface ApprovalProvider {
  verify(input: { repository: string; commit: string; proposalDigest: string }): Promise<{
    verified: boolean;
    reviewers: string[];
    sourceUrl: string;
  }>;
}
