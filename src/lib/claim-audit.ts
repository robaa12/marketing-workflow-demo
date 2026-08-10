import type { CampaignContentDraftOutput, ClaimAuditSummary } from '../schemas/content.js';
import type { KnowledgeCitation } from '../schemas/marketingContext.js';
import { verifyClaims } from '../tools/claim-verifier.tool.js';

const CLAIM_PATTERN = /\b\d+(?:\.\d+)?\s?(?:%|hours?|days?|x)\b|\b(?:best|number\s*one|#1|guarantee(?:d|s)?)\b/i;

export function auditCampaignClaimsForBrand(
  output: CampaignContentDraftOutput,
  approvedClaims: string[],
): ClaimAuditSummary {
  const claims = output.calendar.flatMap((entry, contentIndex) =>
    extractClaimSentences(`${entry.caption}\n${entry.cta}`).map((text) => ({ contentIndex, text })),
  );
  const evidenceByClaim = claims.map(({ text }) => supportingKnowledge(text, output.knowledgeSources));
  const verifications = verifyClaims(
    claims.map(({ text }, index) => ({
      text,
      sourceUrls: evidenceByClaim[index]?.flatMap((citation) => citation.url ? [citation.url] : []) ?? [],
    })),
    [
      ...output.sources.map(({ title, url }) => ({ title, url })),
      ...output.knowledgeSources.flatMap((citation) => citation.url ? [{ title: citation.title, url: citation.url }] : []),
    ],
    approvedClaims,
  ).map((verification, index) => ({
    contentIndex: claims[index]?.contentIndex ?? 0,
    ...verification,
    // A pasted document or official social post can be valid evidence without
    // a public URL. Preserve its source/page trace rather than mislabelling a
    // grounded claim as unsupported.
    ...(verification.status === 'unsupported' && evidenceByClaim[index]?.length
      ? { status: 'evidence-linked' as const }
      : {}),
    supportingKnowledge: evidenceByClaim[index] ?? [],
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

function supportingKnowledge(claim: string, citations: KnowledgeCitation[]): KnowledgeCitation[] {
  const claimTerms = significantTerms(claim);
  const requiredNumbers = claim.match(/\d+(?:\.\d+)?/g) ?? [];
  if (claimTerms.size < 2) return [];
  return citations.filter((citation) => {
    const evidence = `${citation.title} ${citation.excerpt}`.toLocaleLowerCase();
    if (requiredNumbers.some((number) => !evidence.includes(number))) return false;
    const evidenceTerms = significantTerms(evidence);
    let overlap = 0;
    for (const term of claimTerms) if (evidenceTerms.has(term)) overlap += 1;
    // A numeric/superlative claim needs multiple shared specific terms. This
    // is intentionally conservative: the audit reports traceability, not a
    // model's guess that two vaguely related sentences mean the same thing.
    return overlap >= Math.min(3, Math.max(2, Math.ceil(claimTerms.size * 0.5)));
  }).slice(0, 3);
}

function significantTerms(value: string): Set<string> {
  const ignored = new Set(['the', 'and', 'for', 'with', 'your', 'this', 'that', 'from', 'into', 'than', 'every']);
  return new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
    .filter((term) => !ignored.has(term)));
}
