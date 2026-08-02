import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  SocialPlatformEnum,
  PostSchema,
  type SocialPlatform,
  type Post,
} from '../schemas/content.js';

export interface ParseResult {
  weeks: number;
  unit: string;
}

export function parseDuration(duration: string): ParseResult {
  const d = duration.toLowerCase().trim();
  const weeksMatch = d.match(/([\d.]+)\s*week/);
  if (weeksMatch?.[1]) return { weeks: Math.max(1, Math.round(parseFloat(weeksMatch[1]))), unit: 'week' };
  const daysMatch = d.match(/([\d.]+)\s*day/);
  if (daysMatch?.[1])
    return { weeks: Math.max(1, Math.round(parseFloat(daysMatch[1]) / 7)), unit: 'day' };
  const monthMatch = d.match(/([\d.]+)\s*month/);
  if (monthMatch?.[1]) return { weeks: Math.max(1, Math.round(parseFloat(monthMatch[1]) * 4)), unit: 'month' };
  return { weeks: 1, unit: 'week' };
}

export interface CalendarInput {
  posts: Post[];
  platforms: SocialPlatform[];
  duration: string;
  postsPerWeek: number;
  startDate?: string;
}

export function buildCalendar(input: CalendarInput): {
  schedule: Array<{ date: string; postId: string; platform: SocialPlatform }>;
} {
  const startRaw = input.startDate;
  const startDate = startRaw ? new Date(startRaw) : new Date();
  const { weeks } = parseDuration(input.duration);
  const totalSlots = Math.max(1, input.postsPerWeek) * weeks;

  const schedule: Array<{ date: string; postId: string; platform: SocialPlatform }> = [];
  const byPlatform = new Map<SocialPlatform, Post[]>();
  for (const p of input.posts) {
    if (!byPlatform.has(p.platform)) byPlatform.set(p.platform, []);
    byPlatform.get(p.platform)!.push(p);
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const totalDays = weeks * 7;

  for (const platform of input.platforms) {
    const platformPosts = byPlatform.get(platform) ?? [];
    const slotCount = totalSlots;
    for (let i = 0; i < platformPosts.length; i++) {
      const slotIndex = Math.min(i, slotCount - 1);
      const post = platformPosts[i];
      if (!post) continue;
      const slotsAhead = slotCount;
      const fraction = slotsAhead <= 1 ? 0 : slotIndex / (slotsAhead - 1 || 1);
      const dayOffset = Math.min(Math.round(fraction * (totalDays - 1)), totalDays - 1);
      const date = new Date(startDate.getTime() + dayOffset * MS_PER_DAY);
      schedule.push({
        date: date.toISOString().slice(0, 10),
        postId: post.postId,
        platform,
      });
    }
  }

  schedule.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { schedule };
}

export const contentCalendarTool = createTool({
  id: 'content-calendar',
  description:
    'Distributes generated posts across the campaign duration into a dated posting schedule (ISO dates), respecting postsPerWeek per platform.',
  inputSchema: z.object({
    posts: z.array(PostSchema),
    platforms: z.array(SocialPlatformEnum),
    duration: z.string(),
    postsPerWeek: z.number(),
    startDate: z.string().optional().describe('ISO date to start from; defaults to today.'),
  }),
  outputSchema: z.object({
    schedule: z.array(
      z.object({
        date: z.string(),
        postId: z.string(),
        platform: SocialPlatformEnum,
      }),
    ),
  }),
  execute: async (inputData) => {
    return buildCalendar({
      posts: inputData.posts as Post[],
      platforms: inputData.platforms as SocialPlatform[],
      duration: inputData.duration,
      postsPerWeek: inputData.postsPerWeek,
      startDate: inputData.startDate,
    });
  },
});
