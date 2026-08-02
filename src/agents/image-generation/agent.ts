import { Agent } from '@mastra/core/agent';
import { getModel } from '../../lib/model.js';
import { imageGenerationTool } from '../../tools/image-generation.tool.js';

export function buildImageGenerationAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'image-generation-agent',
    name: 'Image Generation Agent',
    description: 'Turns campaign visual concepts into platform-ready image specifications.',
    instructions: 'Use imageGenerationTool to enhance a visual concept and create a platform-ready image specification. Preserve the brand and requested aspect ratio. Clearly state that the current provider is a demo provider when returning a simulated URL.',
    model,
    tools: { imageGenerationTool },
  });
}
