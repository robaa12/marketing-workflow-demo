import { createTool } from '@mastra/core/tools';
import {
  generateImageAsset,
  ImageGenerationInputSchema,
  ImageGenerationResultSchema,
} from '../lib/image-generation.js';

export const imageGenerationTool = createTool({
  id: 'image-generation',
  description: 'Creates an enhanced visual prompt and image specification. The configured demo provider returns a simulated image URL.',
  inputSchema: ImageGenerationInputSchema,
  outputSchema: ImageGenerationResultSchema,
  execute: generateImageAsset,
});
