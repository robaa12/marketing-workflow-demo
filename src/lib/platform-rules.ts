import type { SocialPlatform } from '../schemas/content.js';

export interface PlatformRules {
  platform: SocialPlatform;
  label: string;
  charLimit: number;
  hashtagConvention: string;
  ctaStyle: string;
  format: string;
  bestPractices: string[];
}

const RULES: Record<SocialPlatform, PlatformRules> = {
  x: {
    platform: 'x',
    label: 'X (Twitter)',
    charLimit: 280,
    hashtagConvention:
      '1-2 hashtags max, inline. Threads (numbered) for longer takes. No hashtag spam.',
    ctaStyle: 'Direct, action-oriented, link first. e.g. "Read the thread. Reply with your take."',
    format: 'Single post OR numbered thread (1/N). 280 chars per post.',
    bestPractices: [
      'Hook in first line — gets truncated in timeline previews.',
      'Use 1-2 relevant hashtags; avoid #CamelCase #spam #hashtags.',
      'Threads should each standalone as a complete thought.',
      'End every thread with a CTA post.',
    ],
  },
  instagram: {
    platform: 'instagram',
    label: 'Instagram',
    charLimit: 2200,
    hashtagConvention:
      '3-7 hashtags in a group at the end or first comment. Mix broad + niche.',
    ctaStyle: 'Save / share / comment prompt. "Save this for later" "Tell us below."',
    format: 'Single-image caption OR carousel (multi-slide) OR Reel caption.',
    bestPractices: [
      'First line must grab — appears above "more".',
      'Carousel cover title doubles as on-image headline.',
      'Reels favour trending audio + on-screen text hooks (first 1s).',
      'Keep captions scannable: line breaks, emoji sparingly.',
    ],
  },
  linkedin: {
    platform: 'linkedin',
    label: 'LinkedIn',
    charLimit: 3000,
    hashtagConvention: '3-5 professional hashtags at the end. e.g. #B2B #ProductStrategy.',
    ctaStyle: 'Value-led CTA: "What would you add?" "DM me for the playbook."',
    format: 'Long-form text post, document carousel (PDF), or native video.',
    bestPractices: [
      'Lead with an insight or contrarian observation, not a sales pitch.',
      'Short paragraphs (1-2 sentences) and blank lines for the feed.',
      'Avoid external-link penalty: put links in comments when possible.',
      'Tone: expert, generous, never hype-y.',
    ],
  },
  facebook: {
    platform: 'facebook',
    label: 'Facebook',
    charLimit: 63206,
    hashtagConvention: '2-3 hashtags; keep them contextual, not stacked.',
    ctaStyle: 'Conversational: "Tag a friend who needs this."',
    format: 'Text + image/video. Event and Group cross-posting supported.',
    bestPractices: [
      'Lead with a relatable hook; algorithms reward meaningful comments.',
      'Native video strongly outperforms link posts.',
      'Keep it human and community-toned.',
    ],
  },
  tiktok: {
    platform: 'tiktok',
    label: 'TikTok',
    charLimit: 2200,
    hashtagConvention: '3-5 hashtags mixing trend (#fyp is noise) + niche + branded.',
    ctaStyle: 'Imperative: "Watch till the end" "Stitch this." "Follow for part 2."',
    format: 'Vertical short video (15-60s). On-screen text + native caption.',
    bestPractices: [
      'Hook within the first 1-2 seconds.',
      'Speak the trend language; borrow trending sounds responsibly.',
      'Captions are secondary to the video — keep them tight.',
    ],
  },
  youtube_shorts: {
    platform: 'youtube_shorts',
    label: 'YouTube Shorts',
    charLimit: 1000,
    hashtagConvention: '3 hashtags in title/description. #shorts required.',
    format: 'Vertical video <=60s. Punchy title with keyword.',
    ctaStyle: 'Subscribe + "comment what you want next."',
    bestPractices: [
      'Title under 60 chars; front-load the hook.',
      'Loopable edits increase retention.',
      'Use #shorts plus 1-2 topical tags.',
    ],
  },
};

export function getPlatformRules(platform: SocialPlatform): PlatformRules {
  return RULES[platform];
}

export function allPlatformRules(): PlatformRules[] {
  return Object.values(RULES);
}
