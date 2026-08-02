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
    url: `simulated://image-generation/${seed}`,
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
