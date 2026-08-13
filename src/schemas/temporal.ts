import { z } from 'zod';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export const IsoCalendarDateSchema = z
  .string()
  .refine(isIsoCalendarDate, 'Expected a valid ISO calendar date (YYYY-MM-DD)');

export const TemporalContextSchema = z
  .object({
    asOfDate: IsoCalendarDateSchema.describe(
      'Authoritative current date captured when the workflow run was created.',
    ),
    timeZone: z.string().min(1).describe('IANA time zone used for date boundaries.'),
    campaignStartDate: IsoCalendarDateSchema.describe(
      'Earliest date the workflow may schedule or target.',
    ),
    campaignEndDate: IsoCalendarDateSchema.nullable().default(null),
  })
  .superRefine((value, context) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format();
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['timeZone'],
        message: 'Expected a valid IANA time zone',
      });
    }
    if (value.campaignStartDate < value.asOfDate) {
      context.addIssue({
        code: 'custom',
        path: ['campaignStartDate'],
        message: 'campaignStartDate must not be before asOfDate',
      });
    }
    if (
      value.campaignEndDate &&
      value.campaignEndDate < value.campaignStartDate
    ) {
      context.addIssue({
        code: 'custom',
        path: ['campaignEndDate'],
        message: 'campaignEndDate must not be before campaignStartDate',
      });
    }
  });

export type TemporalContext = z.infer<typeof TemporalContextSchema>;
