import { describe, expect, test } from 'bun:test';
import { getLinearConfig } from '../../api/src/linear/client';
import {
  type FeedbackType,
  formatFeedbackForLinear,
} from '../../api/src/linear/format-feedback';
import { SYNC_LOCK_TTL_MS } from '../../api/src/linear/sync-feedback';

describe('formatFeedbackForLinear', () => {
  test('bug report with all fields', () => {
    const result = formatFeedbackForLinear({
      id: 'feedback-123',
      feedbackType: 'bug',
      description: 'App crashes on submit',
      stepsToReproduce: '1. Click submit\n2. Crash',
      screenshotUrl: 'https://example.com/img.png',
      userId: 'user-1',
      userEmail: 'test@example.com',
    });

    expect(result.title).toBe('[🐛 Bug] App crashes on submit');
    expect(result.description).toContain('## Bug Report');
    expect(result.description).toContain('### Steps to Reproduce');
    expect(result.description).toContain(
      '![Screenshot](https://example.com/img.png)'
    );
    expect(result.description).toContain('**Submitted by:** test@example.com');
    expect(result.description).toContain('**Feedback ID:** `feedback-123`');
  });

  test('feature request with rating', () => {
    const result = formatFeedbackForLinear({
      id: 'feedback-456',
      feedbackType: 'feature_request',
      description: 'Add dark mode',
      rating: 5,
      userId: 'user-2',
    });

    expect(result.title).toBe('[✨ Feature] Add dark mode');
    expect(result.description).toContain('## Feature Request');
    expect(result.description).toContain('⭐⭐⭐⭐⭐ (5/5)');
    expect(result.description).not.toContain('Steps to Reproduce');
  });

  test('performance issue minimal', () => {
    const result = formatFeedbackForLinear({
      id: 'feedback-789',
      feedbackType: 'performance',
      description: 'Page loads slowly',
      userId: 'user-3',
    });

    expect(result.title).toBe('[⚡ Performance] Page loads slowly');
    expect(result.description).toContain('## Performance Issue');
    expect(result.description).toContain('**Submitted by:** Unknown');
  });

  test('title truncates at 80 chars', () => {
    const longDesc = 'A'.repeat(100);
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: longDesc,
      stepsToReproduce: 'steps',
      userId: 'user',
    });

    expect(result.title).toContain('...');
    expect(result.title.length).toBeLessThan(100);
  });

  test('ratings 1-5 produce correct stars', () => {
    for (let rating = 1; rating <= 5; rating++) {
      const result = formatFeedbackForLinear({
        id: `r${rating}`,
        feedbackType: 'feature_request',
        description: 'test',
        rating,
        userId: 'u',
      });
      expect(result.description).toContain(
        `${'⭐'.repeat(rating)} (${rating}/5)`
      );
    }
  });

  test('escapes HTML to prevent XSS', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: '<script>alert("xss")</script>',
      stepsToReproduce: 'steps',
      userId: 'user',
    });
    // HTML should be escaped for safety in Linear's UI
    expect(result.description).toContain('&lt;script&gt;');
    expect(result.description).not.toContain('<script>');
  });

  test('handles unicode', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'feature_request',
      description: '日本語 🎮 emoji',
      rating: 3,
      userId: 'user',
      userEmail: 'test@example.com',
    });
    expect(result.description).toContain('日本語');
    expect(result.description).toContain('test@example.com');
  });

  test('empty optionals produce no sections', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: 'minimal',
      stepsToReproduce: '',
      screenshotUrl: '',
      userId: 'user',
    });
    expect(result.description).not.toContain('### Screenshot');
    expect(result.description).not.toContain('### Steps to Reproduce');
  });

  test('no null/undefined literals in output', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'performance',
      description: 'test',
      userId: 'user',
    });
    expect(result.description).not.toMatch(/\bundefined\b/);
    expect(result.description).not.toMatch(/\bnull\b/);
  });

  test('all feedback types supported', () => {
    const types: FeedbackType[] = ['bug', 'feature_request', 'performance'];
    for (const type of types) {
      expect(() =>
        formatFeedbackForLinear({
          id: 't',
          feedbackType: type,
          description: 'd',
          userId: 'u',
        })
      ).not.toThrow();
    }
  });

  // New tests for username/profile link functionality
  test('formats username with profile link', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: 'test description',
      userId: 'user-1',
      username: 'gold_roach',
      displayName: 'Golden Roach',
    });
    // Check for markdown link format with display name and profile path
    expect(result.description).toContain('[Golden Roach]');
    expect(result.description).toContain('/profile/gold_roach)');
    expect(result.description).toContain('(@gold_roach)');
  });

  test('uses username as display name when displayName is null', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: 'test description',
      userId: 'user-1',
      username: 'gold_roach',
      displayName: null,
    });
    // When displayName is null, username should be used as display name
    expect(result.description).toContain('[gold_roach]');
    expect(result.description).toContain('/profile/gold_roach)');
    expect(result.description).toContain('(@gold_roach)');
  });

  test('falls back to email when username is null', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: 'test description',
      userId: 'user-1',
      username: null,
      displayName: null,
      userEmail: 'test@example.com',
    });
    expect(result.description).toContain('**Submitted by:** test@example.com');
    expect(result.description).not.toContain('https://babylon.game/profile/');
  });

  test('URL-encodes special characters in username', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: 'test description',
      userId: 'user-1',
      username: 'user with spaces',
      displayName: 'User With Spaces',
    });
    expect(result.description).toContain('/profile/user%20with%20spaces');
  });

  test('URL-encodes @ symbol in username', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: 'test description',
      userId: 'user-1',
      username: '@special_user',
      displayName: 'Special User',
    });
    expect(result.description).toContain('/profile/%40special_user');
  });

  test('formats timestamp correctly with Intl.DateTimeFormat', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: 'test description',
      userId: 'user-1',
      createdAt: new Date('2025-12-31T15:30:00Z'),
    });
    // en-GB format: DD/MM/YYYY HH:MM:SS UTC
    expect(result.description).toContain('31/12/2025');
    expect(result.description).toContain('15:30:00');
    expect(result.description).toContain('UTC');
  });

  test('shows Unknown timestamp when createdAt is undefined', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: 'test description',
      userId: 'user-1',
    });
    expect(result.description).toContain('**Submitted at:** Unknown');
  });

  test('escapes HTML in username and displayName', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: 'test',
      userId: 'user-1',
      username: '<script>xss</script>',
      displayName: '<b>Bold Name</b>',
    });
    expect(result.description).toContain('&lt;script&gt;xss&lt;/script&gt;');
    expect(result.description).toContain('&lt;b&gt;Bold Name&lt;/b&gt;');
    expect(result.description).not.toContain('<script>');
    expect(result.description).not.toContain('<b>');
  });

  test('includes Submitted at field in output', () => {
    const result = formatFeedbackForLinear({
      id: 'test',
      feedbackType: 'bug',
      description: 'test',
      userId: 'user-1',
      createdAt: new Date('2025-01-15T10:00:00Z'),
    });
    expect(result.description).toContain('**Submitted at:**');
  });
});

describe('getLinearConfig', () => {
  test('returns null without env vars', () => {
    const orig = {
      api: process.env.LINEAR_API_KEY,
      team: process.env.LINEAR_TEAM_ID,
    };
    process.env.LINEAR_API_KEY = '';
    process.env.LINEAR_TEAM_ID = '';
    expect(getLinearConfig()).toBeNull();
    process.env.LINEAR_API_KEY = orig.api;
    process.env.LINEAR_TEAM_ID = orig.team;
  });

  test('returns config with env vars', () => {
    const orig = {
      api: process.env.LINEAR_API_KEY,
      team: process.env.LINEAR_TEAM_ID,
    };
    process.env.LINEAR_API_KEY = 'lin_api_test';
    process.env.LINEAR_TEAM_ID = 'team-123';
    const config = getLinearConfig();
    expect(config?.apiKey).toBe('lin_api_test');
    expect(config?.teamId).toBe('team-123');
    process.env.LINEAR_API_KEY = orig.api;
    process.env.LINEAR_TEAM_ID = orig.team;
  });
});

describe('SYNC_LOCK_TTL_MS', () => {
  test('is 5 minutes in milliseconds', () => {
    expect(SYNC_LOCK_TTL_MS).toBe(5 * 60 * 1000);
    expect(SYNC_LOCK_TTL_MS).toBe(300000);
  });

  test('is a reasonable TTL for sync operations', () => {
    // Should be at least 1 minute (enough for retries)
    expect(SYNC_LOCK_TTL_MS).toBeGreaterThanOrEqual(60 * 1000);
    // Should be at most 10 minutes (don't block too long)
    expect(SYNC_LOCK_TTL_MS).toBeLessThanOrEqual(10 * 60 * 1000);
  });
});
