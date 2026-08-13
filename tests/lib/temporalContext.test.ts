import { describe, expect, it } from 'vitest';
import {
  dateInTimeZone,
  temporalValueIssues,
} from '../../src/lib/temporal-context.js';

const context = {
  asOfDate: '2026-08-13',
  timeZone: 'Africa/Cairo',
  campaignStartDate: '2026-08-20',
  campaignEndDate: '2026-09-30',
};

describe('temporal context', () => {
  it('uses the configured timezone at day boundaries', () => {
    expect(dateInTimeZone(new Date('2026-08-12T22:30:00.000Z'), 'Africa/Cairo'))
      .toBe('2026-08-13');
  });

  it('finds invalid, past, and out-of-window dates recursively', () => {
    const issues = temporalValueIssues({
      summary: 'Old launch: 2025-09-01.',
      recommendations: ['Impossible: 2026-02-30.', 'Too late: 2026-10-01.'],
    }, context);

    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('date 2025-09-01 is before'),
      expect.stringContaining('date 2026-02-30 is not a valid calendar date'),
      expect.stringContaining('date 2026-10-01 is after'),
    ]));
  });
});
