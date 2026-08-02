import { createStep, createWorkflow } from '@mastra/core/workflows';
import {
  generateImageAsset,
  ImageGenerationInputSchema,
  ImageGenerationResultSchema,
} from '../../lib/image-generation.js';

const generateImageStep = createStep({
  id: 'generate-image',
  description: 'Enhances a visual concept and creates an image-generation specification.',
  inputSchema: ImageGenerationInputSchema,
  outputSchema: ImageGenerationResultSchema,
  execute: async ({ inputData }) => generateImageAsset(inputData),
});

export const imageGenerationWorkflow = createWorkflow({
  id: 'image-generation-workflow',
  description: 'Generates a platform-ready image specification from a visual prompt.',
  inputSchema: ImageGenerationInputSchema,
  outputSchema: ImageGenerationResultSchema,
})
  .then(generateImageStep)
  .commit();
