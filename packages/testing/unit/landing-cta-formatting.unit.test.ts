import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function readComponentSource(relativePathFromRepoRoot: string): string {
  const absolutePath = path.resolve(
    import.meta.dir,
    '../../../',
    relativePathFromRepoRoot
  );
  return readFileSync(absolutePath, 'utf8');
}

describe('Landing CTA formatting', () => {
  test('ComingSoon CTA uses a single combined Develop and Deploy card', () => {
    const source = readComponentSource(
      'apps/web/src/components/shared/ComingSoon.tsx'
    );

    expect(source).toContain('Develop and Deploy');
    expect(source).toContain('Apply for Agent Developer Access');
    expect(source).not.toContain('Build your own Agent');
    expect(source).not.toContain('Request builder access');
    expect(source).not.toContain(
      '1FAIpQLSeYkR5dGc_tgEtelwldohhwSKcpq30o8SJVq78oMSJD4qsWYA'
    );
  });

  test('LandingPage CTA mirrors the same combined card structure', () => {
    const source = readComponentSource(
      'apps/web/src/components/landing/LandingPage.tsx'
    );

    expect(source).toContain('Develop and Deploy');
    expect(source).toContain('Apply for Agent Developer Access');
    expect(source).not.toContain('Build your own Agent');
    expect(source).not.toContain('Request builder access');
    expect(source).not.toContain(
      '1FAIpQLSeYkR5dGc_tgEtelwldohhwSKcpq30o8SJVq78oMSJD4qsWYA'
    );
  });
});
