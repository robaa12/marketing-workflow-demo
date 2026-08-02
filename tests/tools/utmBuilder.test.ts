import { describe, expect, it } from 'vitest';
import { buildUtmUrl } from '../../src/tools/utm-builder.tool.js';

describe('UTM URL builder', () => {
  it('normalizes campaign dimensions while preserving destination parameters', () => {
    expect(buildUtmUrl({
      destinationUrl: 'https://example.com/demo?ref=homepage',
      source: 'LinkedIn',
      medium: 'Organic Social',
      campaign: 'Q3 Reporting Launch',
      content: 'Efficiency Post',
    })).toBe(
      'https://example.com/demo?ref=homepage&utm_source=linkedin&utm_medium=organic-social&utm_campaign=q3-reporting-launch&utm_content=efficiency-post',
    );
  });
});
