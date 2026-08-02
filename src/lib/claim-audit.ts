import type { CampaignContentDraftOutput, ClaimAuditSummary } from '../schemas/content.js';
import { verifyClaims } from '../tools/claim-verifier.tool.js';

const CLAIM_PATTERN = /\b\d+(?:\.\d+)?\s?(?:%|hours?|days?|x)\b|\b(?:best|number\s*one|#1|guarantee(?:d|s)?)\b/i;

export function auditCampaignClaimsForBrand(
  output: CampaignContentDraftOutput,
  approvedClaims: string[],
): ClaimAuditSummary {
  const claims = output.calendar.flatMap((entry, contentIndex) =>
    extractClaimSentences(`${entry.caption}\n${entry.cta}`).map((text) => ({ contentIndex, text })),
  );
  const verifications = verifyClaims(
    claims.map(({ text }) => ({ text })),
    output.sources.map(({ title, url }) => ({ title, url })),
    approvedClaims,
  ).map((verification, index) => ({
    contentIndex: claims[index]?.contentIndex ?? 0,
    ...verification,
  }));

  return {
    verifications,
    unsupportedCount: verifications.filter((verification) => verification.status === 'unsupported').length,
  };
}

function extractClaimSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && CLAIM_PATTERN.test(sentence));
}
