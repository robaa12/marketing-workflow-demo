import {
  TemporalContextSchema,
  type TemporalContext,
  isIsoCalendarDate,
} from '../schemas/temporal.js';
import type { SmartObjective } from '../schemas/objectives.js';

const ISO_DATE_IN_TEXT = /\b\d{4}-\d{2}-\d{2}\b/g;
const AMBIGUOUS_DEADLINE =
  /\b(?:today|tomorrow|yesterday|next\s+(?:week|month|quarter|year)|end\s+of\s+(?:the\s+)?(?:week|month|quarter|year|q[1-4]))\b/i;
const FIXED_RELATIVE_DEADLINE =
  /\b(?:within\s+)?\d+\s+(?:calendar\s+)?(?:days?|weeks?|months?)\s+(?:from|after|of|following)\s+(?:campaign\s+)?(?:start|launch)\b/i;

export function dateInTimeZone(
  date: Date,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function resolveTemporalContext(
  input: TemporalContext | undefined,
  now = new Date(),
): TemporalContext {
  if (input) return TemporalContextSchema.parse(input);
  const timeZone = process.env['WORKFLOW_TIME_ZONE'] ?? 'Africa/Cairo';
  const asOfDate = dateInTimeZone(now, timeZone);
  return TemporalContextSchema.parse({
    asOfDate,
    timeZone,
    campaignStartDate: asOfDate,
    campaignEndDate: null,
  });
}

export function addCalendarDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function calendarDaysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T12:00:00.000Z`);
  const endMs = Date.parse(`${end}T12:00:00.000Z`);
  return Math.round((endMs - startMs) / 86_400_000);
}

export function temporalObjectiveIssues(
  objectives: SmartObjective[],
  temporalContext: TemporalContext,
): string[] {
  const issues: string[] = [];
  for (const objective of objectives) {
    if (AMBIGUOUS_DEADLINE.test(objective.deadline)) {
      issues.push(
        `${objective.id}: deadline "${objective.deadline}" is relative to an unknown clock`,
      );
    }
    const deadlineDates = objective.deadline.match(ISO_DATE_IN_TEXT) ?? [];
    const allDates = [
      ...deadlineDates,
      ...(objective.objective.match(ISO_DATE_IN_TEXT) ?? []),
      ...(objective.timeBound.match(ISO_DATE_IN_TEXT) ?? []),
    ];
    for (const date of new Set(allDates)) {
      if (!isIsoCalendarDate(date)) {
        issues.push(`${objective.id}: date ${date} is not a valid calendar date`);
        continue;
      }
      if (date < temporalContext.campaignStartDate) {
        issues.push(
          `${objective.id}: date ${date} is before the authoritative planning start ${temporalContext.campaignStartDate}`,
        );
      }
      if (
        temporalContext.campaignEndDate &&
        date > temporalContext.campaignEndDate
      ) {
        issues.push(
          `${objective.id}: date ${date} is after the campaign end ${temporalContext.campaignEndDate}`,
        );
      }
    }
    if (
      deadlineDates.length === 0 &&
      !FIXED_RELATIVE_DEADLINE.test(objective.deadline) &&
      !/^\d+\s+(?:days?|weeks?|months?)$/i.test(objective.deadline.trim())
    ) {
      issues.push(
        `${objective.id}: deadline must be an ISO date or a fixed launch-relative duration`,
      );
    }
  }
  return [...new Set(issues)];
}

/**
 * Recursively validates explicit dates anywhere in model-generated output.
 * This catches dates hidden in prose fields that are not represented by a
 * dedicated schema property.
 */
export function temporalValueIssues(
  value: unknown,
  temporalContext: TemporalContext,
  path = 'output',
): string[] {
  const issues: string[] = [];

  if (typeof value === 'string') {
    for (const date of new Set(value.match(ISO_DATE_IN_TEXT) ?? [])) {
      if (!isIsoCalendarDate(date)) {
        issues.push(`${path}: date ${date} is not a valid calendar date`);
      } else if (date < temporalContext.campaignStartDate) {
        issues.push(
          `${path}: date ${date} is before the authoritative planning start ${temporalContext.campaignStartDate}`,
        );
      } else if (
        temporalContext.campaignEndDate &&
        date > temporalContext.campaignEndDate
      ) {
        issues.push(
          `${path}: date ${date} is after the campaign end ${temporalContext.campaignEndDate}`,
        );
      }
    }
    return issues;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      issues.push(...temporalValueIssues(item, temporalContext, `${path}[${index}]`));
    });
    return issues;
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      issues.push(...temporalValueIssues(nested, temporalContext, `${path}.${key}`));
    }
  }

  return [...new Set(issues)];
}
