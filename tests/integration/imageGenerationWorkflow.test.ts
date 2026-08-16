import { afterEach, describe, expect, it, vi } from 'vitest';

const { generateImageMock, generateTextMock } = vi.hoisted(() => ({
  generateImageMock: vi.fn(),
  generateTextMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateImage: generateImageMock,
  generateText: generateTextMock,
}));

import { imageGenerationWorkflow } from '../../src/workflows/image-generation/index.js';

describe('Image Generation workflow', () => {
  afterEach(() => {
    generateImageMock.mockReset();
    generateTextMock.mockReset();
    vi.unstubAllEnvs();
  });

  it('creates a platform-ready Gemini image through Vercel AI Gateway', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-vercel-key');
    vi.stubEnv('VERCEL_IMAGE_MODEL', 'google/gemini-3.1-flash-image');
    generateTextMock.mockResolvedValue({
      files: [{
        mediaType: 'image/png',
        base64: 'ZmFrZS1pbWFnZQ==',
        uint8Array: new TextEncoder().encode('fake-image'),
      }],
    });

    const run = await imageGenerationWorkflow.createRun();
    const result = await run.start({
      inputData: {
        prompt: 'A marketing leader reviewing a clean campaign dashboard',
        style: 'digital-art',
        aspectRatio: '16:9',
        quality: 'standard',
        seed: 42,
      },
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result).toMatchObject({
      url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
      style: 'digital-art',
      aspectRatio: '16:9',
      provider: 'vercel-ai-gateway',
      model: 'google/gemini-3.1-flash-image',
      mimeType: 'image/png',
    });
    expect(result.result.enhancedPrompt).toContain('Digital artwork of');
    expect(generateTextMock).toHaveBeenCalledOnce();
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'google/gemini-3.1-flash-image',
      providerOptions: {
        google: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '1K',
          },
          thinkingConfig: {
            thinkingLevel: 'minimal',
          },
        },
      },
    }));
  });

  it('routes Seedream through the dedicated image API', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-vercel-key');
    vi.stubEnv('VERCEL_IMAGE_MODEL', 'bytedance/seedream-5.0-pro');
    generateImageMock.mockResolvedValue({
      images: [{
        mediaType: 'image/webp',
        base64: 'ZmFrZS1zZWVkcmVhbQ==',
        uint8Array: new TextEncoder().encode('fake-seedream'),
      }],
    });

    const result = await (await imageGenerationWorkflow.createRun()).start({
      inputData: {
        prompt: 'A clean campaign infographic with legible typography',
        style: 'digital-art',
        aspectRatio: '9:16',
        quality: 'hd',
        seed: 84,
      },
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result).toMatchObject({
      url: 'data:image/webp;base64,ZmFrZS1zZWVkcmVhbQ==',
      provider: 'vercel-ai-gateway',
      model: 'bytedance/seedream-5.0-pro',
      mimeType: 'image/webp',
    });
    expect(generateImageMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'bytedance/seedream-5.0-pro',
      size: '1152x2048',
      n: 1,
    }));
    const seedreamOptions = generateImageMock.mock.calls[0]?.[0];
    expect(seedreamOptions).not.toHaveProperty('aspectRatio');
    expect(seedreamOptions).not.toHaveProperty('seed');
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('fails clearly when the Vercel AI Gateway key is missing', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    const run = await imageGenerationWorkflow.createRun();
    const result = await run.start({
      inputData: {
        prompt: 'A campaign image',
        style: 'cinematic',
        aspectRatio: '16:9',
        quality: 'standard',
      },
    });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(JSON.stringify(result.error)).toContain('AI_GATEWAY_API_KEY');
    }
  });

  it('explains when Vercel restricts the image model on the free tier', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-vercel-key');
    vi.stubEnv('VERCEL_IMAGE_MODEL', 'google/gemini-3.1-flash-image');
    generateTextMock.mockRejectedValue(
      new Error('Free tier users do not have access to this model.'),
    );

    const result = await (await imageGenerationWorkflow.createRun()).start({
      inputData: {
        prompt: 'A campaign image',
        style: 'cinematic',
        aspectRatio: '16:9',
        quality: 'standard',
      },
    });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(JSON.stringify(result.error)).toContain('Add paid AI Gateway credits');
    }
  });

  it('explains when an image provider exceeds the configured deadline', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-vercel-key');
    vi.stubEnv('VERCEL_IMAGE_MODEL', 'bytedance/seedream-5.0-pro');
    vi.stubEnv('VERCEL_IMAGE_TIMEOUT_MS', '300000');
    generateImageMock.mockRejectedValue(
      new DOMException('Delay was aborted', 'AbortError'),
    );

    const result = await (await imageGenerationWorkflow.createRun()).start({
      inputData: {
        prompt: 'A campaign image',
        style: 'cinematic',
        aspectRatio: '16:9',
        quality: 'standard',
      },
    });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(JSON.stringify(result.error)).toContain(
        'exceeded the 300000ms deadline',
      );
    }
  });
});
