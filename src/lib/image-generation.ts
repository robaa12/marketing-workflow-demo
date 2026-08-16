import { generateImage, generateText, type GeneratedFile } from 'ai';
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
  provider: z.literal('vercel-ai-gateway'),
  model: z.string().min(1),
  mimeType: z.string().regex(/^image\//),
  specs: z.object({
    composition: z.string(),
    colorPalette: z.array(z.string()),
    lighting: z.string(),
    mood: z.string(),
  }),
});
export type ImageGenerationResult = z.infer<typeof ImageGenerationResultSchema>;

const DEFAULT_VERCEL_IMAGE_MODEL = 'google/gemini-3.1-flash-image';
const DEFAULT_VERCEL_TIMEOUT_MS = 300_000;
const MAX_VERCEL_TIMEOUT_MS = 600_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const SEEDREAM_IMAGE_SIZES: Record<
  ImageQuality,
  Record<ImageAspectRatio, `${number}x${number}`>
> = {
  standard: {
    '1:1': '1024x1024',
    '16:9': '1344x768',
    '9:16': '768x1344',
    '21:9': '1344x576',
    '4:3': '1152x864',
    '3:2': '1152x768',
  },
  hd: {
    '1:1': '2048x2048',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
    '21:9': '2016x864',
    '4:3': '2048x1536',
    '3:2': '2016x1344',
  },
};

export class VercelImageGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VercelImageGenerationError';
  }
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
 * Shared Vercel AI Gateway implementation for the standalone image workflow,
 * its agent tool, and the social-content workflow. It routes multimodal Gemini
 * models through generateText and dedicated image models through generateImage.
 * The data URI keeps the Gateway key server-side and can be rendered directly
 * by the existing web client.
 */
export async function generateImageAsset(input: ImageGenerationInput): Promise<ImageGenerationResult> {
  const data = ImageGenerationInputSchema.parse(input);
  const apiKey = process.env['AI_GATEWAY_API_KEY']?.trim();
  if (!apiKey) {
    throw new VercelImageGenerationError(
      'AI_GATEWAY_API_KEY is required for image generation. Add it to marketing-workflow-demo/.env and restart Mastra.',
    );
  }

  const model = resolveVercelImageModel(
    process.env['VERCEL_IMAGE_MODEL']?.trim() ||
      process.env['GEMINI_IMAGE_MODEL']?.trim() ||
      DEFAULT_VERCEL_IMAGE_MODEL,
  );
  const timeoutMs = readBoundedIntegerEnv(
    'VERCEL_IMAGE_TIMEOUT_MS',
    DEFAULT_VERCEL_TIMEOUT_MS,
    5_000,
    MAX_VERCEL_TIMEOUT_MS,
  );
  const seed = data.seed ?? Math.floor(Math.random() * 4_294_967_294) + 1;
  const details = STYLE_DETAILS[data.style];
  const enhancedPrompt = [
    `${STYLE_PREFIXES[data.style]} ${data.prompt}`,
    details.lighting.toLowerCase(),
    details.mood.toLowerCase(),
    'professional social-media composition',
    'keep important subjects inside the center safe area',
    `${data.aspectRatio} aspect ratio`,
    data.negativePrompt
      ? `Do not include: ${data.negativePrompt}`
      : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  let files: GeneratedFile[];
  try {
    files = isGeminiImageLanguageModel(model)
      ? await generateGeminiImage(model, enhancedPrompt, data, timeoutMs)
      : await generateDedicatedImage(model, enhancedPrompt, data, seed, timeoutMs);
  } catch (error) {
    throw new VercelImageGenerationError(
      vercelGatewayErrorMessage(error, timeoutMs),
      { cause: error },
    );
  }

  const image = files.slice().reverse().find(file => file.mediaType.startsWith('image/'));
  if (!image) {
    throw new VercelImageGenerationError(
      'Vercel AI Gateway returned no image. Try a different visual prompt.',
    );
  }

  const byteLength = image.uint8Array.byteLength;
  if (byteLength === 0 || byteLength > MAX_IMAGE_BYTES) {
    throw new VercelImageGenerationError(
      `Vercel AI Gateway returned an invalid image size (${byteLength} bytes).`,
    );
  }

  return {
    url: `data:${image.mediaType};base64,${image.base64}`,
    seed,
    prompt: data.prompt,
    enhancedPrompt,
    style: data.style,
    aspectRatio: data.aspectRatio,
    quality: data.quality,
    provider: 'vercel-ai-gateway',
    model,
    mimeType: image.mediaType,
    specs: {
      composition: 'Rule of thirds with generous negative space for platform-safe copy.',
      colorPalette: details.palette,
      lighting: details.lighting,
      mood: details.mood,
    },
  };
}

function resolveVercelImageModel(model: string): string {
  const trimmed = model.trim();
  const normalized = trimmed.startsWith('gemini-') ? `google/${trimmed}` : trimmed;
  const segments = normalized.split('/');
  if (
    normalized.length > 256 ||
    segments.length < 2 ||
    segments.some(segment => !/^[a-z0-9][a-z0-9._-]*$/i.test(segment))
  ) {
    throw new VercelImageGenerationError(
      'VERCEL_IMAGE_MODEL must use a valid Vercel provider/model ID, such as google/gemini-3.1-flash-image or bytedance/seedream-5.0-pro.',
    );
  }
  return normalized;
}

function isGeminiImageLanguageModel(model: string): boolean {
  return /^google\/gemini-[a-z0-9._-]*image(?:[a-z0-9._-]*)$/i.test(model);
}

async function generateGeminiImage(
  model: string,
  prompt: string,
  data: z.output<typeof ImageGenerationInputSchema>,
  timeoutMs: number,
): Promise<GeneratedFile[]> {
  const result = await generateText({
    model,
    prompt,
    timeout: timeoutMs,
    maxRetries: 2,
    providerOptions: {
      google: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: data.aspectRatio,
          imageSize: data.quality === 'hd' ? '2K' : '1K',
        },
        thinkingConfig: {
          thinkingLevel: 'minimal',
        },
      },
    },
  });
  return result.files;
}

async function generateDedicatedImage(
  model: string,
  prompt: string,
  data: z.output<typeof ImageGenerationInputSchema>,
  seed: number,
  timeoutMs: number,
): Promise<GeneratedFile[]> {
  if (/^bytedance\/seedream-/i.test(model)) {
    const result = await generateImage({
      model,
      prompt,
      size: SEEDREAM_IMAGE_SIZES[data.quality][data.aspectRatio],
      n: 1,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return result.images;
  }

  const result = await generateImage({
    model,
    prompt,
    aspectRatio: data.aspectRatio,
    seed,
    n: 1,
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });
  return result.images;
}

function readBoundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new VercelImageGenerationError(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function vercelGatewayErrorMessage(error: unknown, timeoutMs: number): string {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.toLowerCase();
  if (
    normalized.includes('delay was aborted') ||
    normalized.includes('operation was aborted') ||
    normalized.includes('signal is aborted')
  ) {
    return `Vercel AI Gateway image generation exceeded the ${timeoutMs}ms deadline while waiting for the provider. Retry the request or increase VERCEL_IMAGE_TIMEOUT_MS up to ${MAX_VERCEL_TIMEOUT_MS}.`;
  }
  if (
    normalized.includes('free tier users do not have access') ||
    normalized.includes('restrictedmodelserror')
  ) {
    return 'Vercel AI Gateway blocks this image model on the team free tier. Add paid AI Gateway credits in the Vercel dashboard, then retry.';
  }
  if (
    normalized.includes('authentication') ||
    normalized.includes('unauthorized') ||
    normalized.includes('invalid api key') ||
    normalized.includes('status code: 401')
  ) {
    return 'Vercel AI Gateway authentication failed. Check AI_GATEWAY_API_KEY and restart Mastra.';
  }
  if (
    (normalized.includes('insufficient') && normalized.includes('credit')) ||
    normalized.includes('payment required') ||
    normalized.includes('status code: 402')
  ) {
    return 'Vercel AI Gateway has insufficient credits. Add credits in the Vercel AI Gateway dashboard and retry.';
  }
  return `Vercel AI Gateway image generation failed: ${raw.slice(0, 1_000)}`;
}
