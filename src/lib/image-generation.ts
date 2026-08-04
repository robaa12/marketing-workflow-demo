import { z } from 'zod';

export const ImageStyleSchema = z.enum([
  'photorealistic', 'cinematic', 'anime', 'digital-art', 'oil-painting',
  'watercolor', 'pixel-art', 'sketch', '3d-render', 'fantasy-art',
  'vaporwave', 'minimalist',
]);
export type ImageStyle = z.infer<typeof ImageStyleSchema>;

export const ImageAspectRatioSchema = z.enum(['1:1', '16:9', '9:16', '21:9', '4:3', '3:2']);
export type ImageAspectRatio = z.infer<typeof ImageAspectRatioSchema>;

export const ImageQualitySchema = z.enum(['standard', 'hd']);
export type ImageQuality = z.infer<typeof ImageQualitySchema>;

export const ImageGenerationInputSchema = z.object({
  prompt: z.string().min(3).max(1_000),
  style: ImageStyleSchema.default('cinematic'),
  aspectRatio: ImageAspectRatioSchema.default('16:9'),
  quality: ImageQualitySchema.default('standard'),
  negativePrompt: z.string().max(500).optional(),
  seed: z.number().int().positive().optional(),
});
export type ImageGenerationInput = z.input<typeof ImageGenerationInputSchema>;

export const ImageGenerationResultSchema = z.object({
  url: z.string(),
  seed: z.number().int().positive(),
  prompt: z.string(),
  enhancedPrompt: z.string(),
  style: ImageStyleSchema,
  aspectRatio: ImageAspectRatioSchema,
  quality: ImageQualitySchema,
  provider: z.literal('demo'),
  specs: z.object({
    composition: z.string(),
    colorPalette: z.array(z.string()),
    lighting: z.string(),
    mood: z.string(),
  }),
});
export type ImageGenerationResult = z.infer<typeof ImageGenerationResultSchema>;

function escapeSvgText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function createDemoImageDataUrl(
  prompt: string,
  seed: number,
  details: { palette: string[]; lighting: string; mood: string },
): string {
  const title = escapeSvgText(prompt.replace(/\s+/g, ' ').trim().slice(0, 72));
  const accentHue = seed % 360;
  const secondaryHue = (accentHue + 74) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="hsl(${accentHue} 48% 22%)"/>
        <stop offset="1" stop-color="hsl(${secondaryHue} 58% 42%)"/>
      </linearGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="55"/></filter>
    </defs>
    <rect width="1200" height="675" fill="url(#bg)"/>
    <circle cx="1010" cy="80" r="280" fill="hsl(${secondaryHue} 80% 72% / .32)" filter="url(#blur)"/>
    <circle cx="140" cy="650" r="310" fill="hsl(${accentHue} 90% 78% / .22)" filter="url(#blur)"/>
    <path d="M760 85c150 70 270 190 340 360-180-20-330 30-460 150-20-210 20-380 120-510Z" fill="white" opacity=".09"/>
    <rect x="72" y="72" width="1056" height="531" rx="42" fill="none" stroke="white" stroke-opacity=".28"/>
    <text x="96" y="470" fill="white" font-family="Georgia,serif" font-size="52" font-weight="600">${title || 'Campaign visual'}</text>
    <text x="98" y="524" fill="white" fill-opacity=".72" font-family="Arial,sans-serif" font-size="22">${escapeSvgText(details.mood)} · ${escapeSvgText(details.lighting)}</text>
    <text x="98" y="566" fill="white" fill-opacity=".52" font-family="Arial,sans-serif" font-size="16" letter-spacing="4">AETHERFLOW VISUAL STUDY</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const STYLE_PREFIXES: Record<ImageStyle, string> = {
  photorealistic: 'Photorealistic photograph of', cinematic: 'Cinematic scene of',
  anime: 'Anime-style illustration of', 'digital-art': 'Digital artwork of',
  'oil-painting': 'Oil painting of', watercolor: 'Watercolor painting of',
  'pixel-art': 'Pixel art of', sketch: 'Hand-drawn sketch of',
  '3d-render': '3D render of', 'fantasy-art': 'Fantasy artwork of',
  vaporwave: 'Vaporwave-style artwork of', minimalist: 'Minimalist composition of',
};

const STYLE_DETAILS: Record<ImageStyle, { palette: string[]; lighting: string; mood: string }> = {
  photorealistic: { palette: ['Natural earth tones', 'true-to-life color'], lighting: 'Soft natural light', mood: 'Authentic and grounded' },
  cinematic: { palette: ['Rich amber', 'cool teal'], lighting: 'Dramatic three-point lighting', mood: 'Confident and atmospheric' },
  anime: { palette: ['Vibrant pastels', 'sky blue'], lighting: 'Soft diffused light', mood: 'Energetic and expressive' },
  'digital-art': { palette: ['Bold brand colors', 'smooth gradients'], lighting: 'Studio-quality digital lighting', mood: 'Modern and polished' },
  'oil-painting': { palette: ['Warm ochre', 'deep umber'], lighting: 'Gallery-style directional light', mood: 'Timeless and textured' },
  watercolor: { palette: ['Soft washes', 'paper white'], lighting: 'Gentle ambient light', mood: 'Calm and organic' },
  'pixel-art': { palette: ['Limited retro palette', 'high contrast'], lighting: 'Stylized pixel highlights', mood: 'Playful and nostalgic' },
  sketch: { palette: ['Charcoal grey', 'paper white'], lighting: 'High-contrast pencil shading', mood: 'Thoughtful and handcrafted' },
  '3d-render': { palette: ['Refined neutral palette', 'brand accent'], lighting: 'Ray-traced studio lighting', mood: 'Precise and premium' },
  'fantasy-art': { palette: ['Emerald', 'magical gold'], lighting: 'Volumetric god rays', mood: 'Imaginative and epic' },
  vaporwave: { palette: ['Neon pink', 'cyan'], lighting: 'Neon glow', mood: 'Retro-futuristic' },
  minimalist: { palette: ['Warm grey', 'single brand accent'], lighting: 'Clean soft light', mood: 'Quiet and focused' },
};

/** Maps a social-platform visual format to a provider-supported image ratio. */
export function resolveImageAspectRatio(value: string): ImageAspectRatio {
  if (value.includes('9:16') || /reel|vertical|short/i.test(value)) return '9:16';
  if (value.includes('1:1') || /instagram|square/i.test(value)) return '1:1';
  if (value.includes('21:9')) return '21:9';
  if (value.includes('4:3')) return '4:3';
  if (value.includes('3:2')) return '3:2';
  return '16:9';
}

/**
 * Shared image-generation implementation for the standalone image workflow,
 * its agent tool, and the social-content workflow. The current provider is a
 * deterministic demo generator inherited from the original image-agent PR.
 */
export async function generateImageAsset(input: ImageGenerationInput): Promise<ImageGenerationResult> {
  const data = ImageGenerationInputSchema.parse(input);
  const seed = data.seed ?? Math.floor(Math.random() * 4_294_967_295);
  const details = STYLE_DETAILS[data.style];
  const enhancedPrompt = `${STYLE_PREFIXES[data.style]} ${data.prompt}, ${details.lighting.toLowerCase()}, ${details.mood.toLowerCase()}, professional composition, ${data.aspectRatio} aspect ratio`;

  return {
    url: createDemoImageDataUrl(data.prompt, seed, details),
    seed,
    prompt: data.prompt,
    enhancedPrompt,
    style: data.style,
    aspectRatio: data.aspectRatio,
    quality: data.quality,
    provider: 'demo',
    specs: {
      composition: 'Rule of thirds with generous negative space for platform-safe copy.',
      colorPalette: details.palette,
      lighting: details.lighting,
      mood: details.mood,
    },
  };
}
