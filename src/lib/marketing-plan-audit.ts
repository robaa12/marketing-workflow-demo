import type {
  CampaignStrategy,
  MarketingPlanIssue,
  MarketingPlanQuality,
  ProductProfile,
  SmartObjective,
  STPResearch,
  STPResult,
} from '../schemas/index.js';

const RISKY_CLAIM = /\b(?:\d+(?:\.\d+)?\s?(?:%|hours?|minutes?|days?)|real[- ]time|guarantee|money[- ]back|GDPR|SOC ?2|Shopify|WooCommerce|Salesforce|HubSpot|Google Analytics|case study)\b/i;

export function auditMarketingPlan(input: {
  product: ProductProfile;
  stp: STPResult;
  smartObjectives: SmartObjective[];
  campaignStrategy: CampaignStrategy;
  research: STPResearch;
}): MarketingPlanQuality {
  const issues: MarketingPlanIssue[] = [];
  const { product, stp, smartObjectives, campaignStrategy, research } = input;

  if (research.citations.length === 0) {
    issues.push(issue('warning', 'missing-evidence', 'stpResearch', 'No market citations were available for the STP decision.', 'Validate the ICP and competitor assumptions with customer interviews or market research.'));
  }
  if (research.warnings.length > 0) {
    issues.push(issue('warning', 'research-warning', 'stpResearch', `${research.warnings.length} research query or queries failed.`, 'Review the STP research warnings and rerun research before committing paid budget.'));
  }

  const primary = stp.targetedSegments.find((segment) => segment.priority === 'primary');
  const primarySegment = primary ? stp.segments.find((segment) => segment.id === primary.segmentId) : undefined;
  if (product.targetMarket && primarySegment && !hasMeaningfulOverlap(product.targetMarket, `${primarySegment.label} ${primarySegment.industry.join(' ')}`)) {
    issues.push(issue('error', 'icp-drift', 'stp.targetedSegments', `Primary segment "${primarySegment.label}" does not clearly match the supplied target market "${product.targetMarket}".`, 'Choose a primary segment inside the stated target market or explicitly update the product brief.'));
  }

  const channelTotal = sum(campaignStrategy.primaryChannels.map((channel) => channel.estimatedShare));
  if (channelTotal !== 100) {
    issues.push(issue('error', 'channel-allocation-total', 'campaignStrategy.primaryChannels', `Channel allocations total ${channelTotal}% instead of 100%.`, 'Reallocate channel shares so they total exactly 100%.'));
  }
  const budgetTotal = sum(campaignStrategy.budgetAllocation.map((allocation) => allocation.percentage));
  if (budgetTotal !== 100) {
    issues.push(issue('error', 'budget-allocation-total', 'campaignStrategy.budgetAllocation', `Budget allocations total ${budgetTotal}% instead of 100%.`, 'Reallocate budget buckets so they total exactly 100%.'));
  }

  const baselineStatus = smartObjectives.map((objective) => {
    const baseline = objective.baseline?.trim();
    const status = !baseline ? 'missing' as const : /assum|estimate|unknown/i.test(baseline) ? 'assumed' as const : 'known' as const;
    if (status !== 'known') {
      issues.push(issue('warning', `objective-baseline-${status}`, `smartObjectives.${objective.id}`, `Objective "${objective.id}" has a ${status} baseline.`, 'Replace it with a dated source-of-truth baseline before launch.'));
    }
    if (/(?:next month|next quarter|end of q[1-4])/i.test(objective.deadline)) {
      issues.push(issue('warning', 'ambiguous-deadline', `smartObjectives.${objective.id}`, `Objective "${objective.id}" uses a relative or quarter-only deadline.`, 'Replace it with an ISO date or a campaign start date plus a fixed duration.'));
    }
    return { objectiveId: objective.id, status, baseline };
  });

  const claims = collectCampaignText(campaignStrategy);
  const verifiedText = product.verifiedFacts.join(' ').toLowerCase();
  for (const claim of claims.filter((value) => RISKY_CLAIM.test(value))) {
    if (!isSupportedClaim(claim, verifiedText)) {
      issues.push(issue('warning', 'unsupported-claim', 'campaignStrategy', `Potentially unsupported claim: "${claim.slice(0, 180)}"`, 'Remove it, label it as a test hypothesis, or link it to approved product evidence.'));
    }
  }

  const mappedKpis = new Set(campaignStrategy.campaignRecommendations.map((campaign) => campaign.primaryKpi.toLowerCase()));
  for (const objective of smartObjectives) {
    if (![...mappedKpis].some((kpi) => kpi.includes(objective.kpi.toLowerCase()) || objective.kpi.toLowerCase().includes(kpi))) {
      issues.push(issue('warning', 'unmapped-objective', `smartObjectives.${objective.id}`, `No campaign has a primary KPI aligned to "${objective.kpi}".`, 'Add a campaign, make it a secondary KPI, or remove the objective from this planning horizon.'));
    }
  }

  const errorCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.filter((item) => item.severity === 'warning').length;
  const score = Math.max(0, 100 - errorCount * 18 - warningCount * 5);
  const status = errorCount > 0 ? 'needs-rework' : warningCount > 0 ? 'needs-evidence' : 'ready-for-review';

  return {
    score,
    status,
    evidenceSources: research.citations,
    assumptionRegister: [...product.assumptions, ...research.warnings],
    baselineStatus,
    channelForecast: campaignStrategy.primaryChannels.map((channel) => ({
      channel: channel.channel,
      allocationPercent: channel.estimatedShare,
      primaryKpis: channel.expectedKpis,
      status: 'requires-budget-and-baseline' as const,
    })),
    issues: uniqueIssues(issues),
    nextDecisions: buildNextDecisions(issues),
    strategyRevision: {
      attempted: false,
      addressedIssueCodes: [],
      remainingActionableIssueCodes: [],
    },
  };
}

function issue(severity: MarketingPlanIssue['severity'], code: string, field: string, message: string, resolution: string): MarketingPlanIssue {
  return { severity, code, field, message, resolution };
}

function sum(values: number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}

function hasMeaningfulOverlap(left: string, right: string): boolean {
  const ignored = new Set(['and', 'the', 'for', 'with', 'small', 'mid', 'sized', 'companies', 'company']);
  const leftWords = new Set(left.toLowerCase().match(/[a-z]{4,}/g)?.filter((word) => !ignored.has(word)) ?? []);
  const rightWords = new Set(right.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  return [...leftWords].some((word) => rightWords.has(word));
}

function collectCampaignText(strategy: CampaignStrategy): string[] {
  return [
    strategy.summary,
    ...strategy.creativeDirection.keyMessages,
    ...strategy.campaignRecommendations.flatMap((campaign) => [campaign.objective, ...campaign.contentMix.map((item) => `${item.topic} ${item.goal}`)]),
    ...strategy.experiments.flatMap((experiment) => [experiment.hypothesis, experiment.successCriteria]),
  ];
}

function isSupportedClaim(claim: string, verifiedText: string): boolean {
  const specificTerms = claim.toLowerCase().match(/real[- ]time|guarantee|money[- ]back|gdpr|soc ?2|shopify|woocommerce|salesforce|hubspot|google analytics|\d+(?:\.\d+)?\s?(?:%|hours?|minutes?|days?)/g) ?? [];
  return specificTerms.length > 0 && specificTerms.every((term) => verifiedText.includes(term));
}

function uniqueIssues(issues: MarketingPlanIssue[]): MarketingPlanIssue[] {
  return [...new Map(issues.map((item) => [`${item.code}:${item.message}`, item])).values()];
}

function buildNextDecisions(issues: MarketingPlanIssue[]): string[] {
  const decisions: string[] = [];
  if (issues.some((item) => item.code === 'icp-drift')) decisions.push('Confirm one primary ICP that matches the supplied target market.');
  if (issues.some((item) => item.code.includes('baseline'))) decisions.push('Supply dated baselines for traffic, leads, activation, conversion, and churn.');
  if (issues.some((item) => item.code === 'unsupported-claim')) decisions.push('Approve or remove every flagged capability, outcome, and proof claim.');
  if (issues.some((item) => item.code === 'missing-evidence' || item.code === 'research-warning')) decisions.push('Review market evidence before approving paid-channel investment.');
  if (issues.some((item) => item.code.includes('allocation'))) decisions.push('Reconcile channel and budget allocation totals to 100%.');
  return decisions.length > 0 ? decisions : ['Approve the plan for execution and establish a weekly KPI review.'];
}
