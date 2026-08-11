import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Docker runtime', () => {
  it('excludes every environment-file variant from the image context', async () => {
    const dockerIgnore = await readFile(
      new URL('../../.dockerignore', import.meta.url),
      'utf8',
    );
    const patterns = dockerIgnore.split(/\r?\n/);

    expect(patterns).toContain('.env*');
    expect(patterns).toContain('!.env.example');
    expect(patterns).not.toContain('.env');
  });
});
