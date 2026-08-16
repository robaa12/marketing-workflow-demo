import { createTool } from '@mastra/core/tools';
import {
  generateImageAsset,
  ImageGenerationInputSchema,
  ImageGenerationResultSchema,
} from '../lib/image-generation.js';

export const imageGenerationTool = createTool({
  id: 'image-generation',
  description: 'Generates a real image through Vercel AI Gateway and returns a browser-ready image data URI plus its visual specification.',
  inputSchema: ImageGenerationInputSchema,
  outputSchema: ImageGenerationResultSchema,
  execute: generateImageAsset,
});
