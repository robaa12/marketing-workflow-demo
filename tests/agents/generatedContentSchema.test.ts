import { describe, expect, it } from 'vitest';
import {
  ContentItemGenerationInputSchema,
  GeneratedContentItemSchema,
} from '../../src/schemas/generated-content.js';

describe('per-item content generation contracts', () => {
  it('accepts the backend brief shape', () => {
    const parsed = ContentItemGenerationInputSchema.parse({
      project: { id: 'project-1', name: 'Acme', description: null },
      campaign: {
        id: 'campaign-1',
        name: 'Launch',
        description: null,
        objective: 'Drive trials',
        audience: 'Marketing leads',
        tone: 'Direct',
        channels: ['linkedin'],
        startDate: null,
        endDate: null,
      },
      type: 'linkedin',
      instructions: 'Focus on the time saved.',
      previous: null,
    });

    expect(parsed.type).toBe('linkedin');
  });

  it('rejects empty generated copy', () => {
    expect(() =>
      GeneratedContentItemSchema.parse({
        type: 'linkedin',
        title: 'Launch post',
        body: '',
        payload: {},
        format: 'MARKDOWN',
      }),
    ).toThrow();
  });
});
