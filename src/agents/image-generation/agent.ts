import { Agent } from '@mastra/core/agent';
import { getModel } from '../../lib/model.js';
import { imageGenerationTool } from '../../tools/image-generation.tool.js';

export function buildImageGenerationAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'image-generation-agent',
    name: 'Image Generation Agent',
    description: 'Turns campaign visual concepts into platform-ready images through Vercel AI Gateway.',
    instructions: 'Use imageGenerationTool to generate a platform-ready image. Preserve the brand, requested style, and aspect ratio. Return the generated image result accurately and never claim that an image was created when the tool failed.',
    model,
    tools: { imageGenerationTool },
  });
}
