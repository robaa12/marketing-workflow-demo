import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../src/tools/content-calendar.tool.js';

const posts = Array.from({ length: 3 }, (_, index) => ({
  postId: `linkedin-${index + 1}`,
  platform: 'linkedin' as const,
  index,
  caption: `Post ${index + 1}`,
  cta: 'Learn more',
  format: 'text',
}));

describe('content calendar dates', () => {
  it('uses the authoritative campaign start instead of the machine clock', () => {
    const result = buildCalendar({
      posts,
      platforms: ['linkedin'],
      duration: '1 week',
      postsPerWeek: 3,
      startDate: '2026-08-20',
    });

    expect(result.schedule.map((item) => item.date)).toEqual([
      '2026-08-20',
      '2026-08-23',
      '2026-08-26',
    ]);
  });

  it('never schedules after the inclusive campaign end date', () => {
    const result = buildCalendar({
      posts,
      platforms: ['linkedin'],
      duration: '4 weeks',
      postsPerWeek: 3,
      startDate: '2026-08-20',
      endDate: '2026-08-22',
    });

    expect(result.schedule.every((item) => item.date <= '2026-08-22')).toBe(
      true,
    );
  });

  it('rejects an end date before the campaign start', () => {
    expect(() =>
      buildCalendar({
        posts,
        platforms: ['linkedin'],
        duration: '1 week',
        postsPerWeek: 3,
        startDate: '2026-08-20',
        endDate: '2026-08-19',
      }),
    ).toThrow('endDate must not be before startDate');
  });
});
