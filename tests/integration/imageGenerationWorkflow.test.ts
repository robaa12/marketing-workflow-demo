import { describe, expect, it } from 'vitest';
import { imageGenerationWorkflow } from '../../src/workflows/image-generation/index.js';

describe('Image Generation workflow', () => {
  it('creates a platform-ready image specification', async () => {
    const run = await imageGenerationWorkflow.createRun();
    const result = await run.start({
      inputData: {
        prompt: 'A marketing leader reviewing a clean campaign dashboard',
        style: 'digital-art',
        aspectRatio: '1:1',
        quality: 'standard',
        seed: 42,
      },
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result).toMatchObject({
      url: 'simulated://image-generation/42',
      style: 'digital-art',
      aspectRatio: '1:1',
    });
    expect(result.result.enhancedPrompt).toContain('Digital artwork of');
  });
});
