import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const CitationSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});

const ClaimSchema = z.object({
  text: z.string().min(3),
  sourceUrls: z.array(z.string().url()).max(5).optional().default([]),
});

export type ClaimVerification = {
  text: string;
  status: 'approved' | 'evidence-linked' | 'unsupported';
  supportingUrls: string[];
};

export function verifyClaims(
  claims: Array<{ text: string; sourceUrls?: string[] }>,
  citations: Array<z.infer<typeof CitationSchema>>,
  approvedClaims: string[],
): ClaimVerification[] {
  const approved = new Set(approvedClaims.map(normalize));
  const knownUrls = new Set(citations.map((citation) => citation.url));

  return claims.map((claim) => {
    if (approved.has(normalize(claim.text))) {
      return { text: claim.text, status: 'approved', supportingUrls: [] };
    }
    const supportingUrls = [...new Set((claim.sourceUrls ?? []).filter((url) => knownUrls.has(url)))];
    return supportingUrls.length > 0
      ? { text: claim.text, status: 'evidence-linked', supportingUrls }
      : { text: claim.text, status: 'unsupported', supportingUrls: [] };
  });
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export const claimVerifierTool = createTool({
  id: 'claim-verifier',
  description:
    'Checks whether marketing claims are approved or explicitly linked to supplied citations. It verifies traceability, not factual truth; unsupported claims must be rewritten or removed.',
  strict: true,
  inputExamples: [{
    input: {
      claims: [{ text: 'Teams save five hours each week.', sourceUrls: ['https://example.com/case-study'] }],
      citations: [{ title: 'Customer case study', url: 'https://example.com/case-study' }],
      approvedClaims: [],
    },
  }],
  inputSchema: z.object({
    claims: z.array(ClaimSchema).min(1).max(30),
    citations: z.array(CitationSchema).max(30),
    approvedClaims: z.array(z.string()).max(50).default([]),
  }),
  outputSchema: z.object({
    verifications: z.array(z.object({
      text: z.string(),
      status: z.enum(['approved', 'evidence-linked', 'unsupported']),
      supportingUrls: z.array(z.string().url()),
    })),
  }),
  execute: async ({ claims, citations, approvedClaims }) => ({
    verifications: verifyClaims(claims, citations, approvedClaims),
  }),
});
