/**
 * Integration Test: General Game Feedback API
 *
 * Tests the /api/feedback/game-feedback endpoint for submitting
 * bug reports, feature requests, and performance feedback.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { db } from '@babylon/db';
import { NextRequest } from 'next/server';

// Mock Linear sync to prevent actual API calls in tests
mock.module('@babylon/api/linear', () => ({
  syncFeedbackToLinear: async () => {
    return;
  },
  getLinearConfig: () => null,
}));

// Mock auth to return a test user
const testUserId = `test-user-${Date.now()}`;
mock.module('@babylon/api', () => {
  const actual = require('@babylon/api');
  return {
    ...actual,
    authenticate: async () => ({ userId: testUserId }),
    checkRateLimitAndDuplicates: () => null,
    requireUserByIdentifier: async () => ({
      id: testUserId,
      email: 'test@example.com',
    }),
  };
});

// Dynamic import to ensure mocks are applied
const { POST: submitGameFeedback } = await import(
  '@/app/api/feedback/game-feedback/route'
);

describe('General Game Feedback API', () => {
  beforeAll(async () => {
    // Create test user
    await db.user.upsert({
      where: { id: testUserId },
      create: {
        id: testUserId,
        username: `feedback-test-${Date.now()}`,
        displayName: 'Feedback Test User',
        updatedAt: new Date(),
      },
      update: {},
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await db.feedback.deleteMany({ where: { fromUserId: testUserId } });
    await db.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  test('POST /api/feedback/game-feedback - bug report succeeds', async () => {
    const payload = {
      feedbackType: 'bug',
      description: 'Test bug report - the button does not work correctly',
      stepsToReproduce: '1. Click button\n2. Nothing happens\n3. Expected: modal opens',
    };

    const request = new NextRequest(
      'http://localhost/api/feedback/game-feedback',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      }
    );

    const response = await submitGameFeedback(request);
    expect(response.status).toBe(201);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.feedbackId).toBeDefined();
    expect(json.message).toContain('feedback');

    // Verify feedback was created in DB
    const feedback = await db.feedback.findUnique({
      where: { id: json.feedbackId },
    });
    expect(feedback).toBeTruthy();
    expect(feedback?.category).toBe('bug_report');
    expect(feedback?.comment).toBe(payload.description);
  });

  test('POST /api/feedback/game-feedback - feature request succeeds', async () => {
    const payload = {
      feedbackType: 'feature_request',
      description: 'Test feature request - add dark mode toggle in settings',
      rating: 4,
    };

    const request = new NextRequest(
      'http://localhost/api/feedback/game-feedback',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      }
    );

    const response = await submitGameFeedback(request);
    expect(response.status).toBe(201);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.feedbackId).toBeDefined();

    // Verify feedback was created with correct score
    const feedback = await db.feedback.findUnique({
      where: { id: json.feedbackId },
    });
    expect(feedback).toBeTruthy();
    expect(feedback?.category).toBe('feature_request');
    expect(feedback?.score).toBe(80); // rating 4 * 20 = 80
  });

  test('POST /api/feedback/game-feedback - performance issue succeeds', async () => {
    const payload = {
      feedbackType: 'performance',
      description: 'Test performance issue - game lags when many agents are online',
    };

    const request = new NextRequest(
      'http://localhost/api/feedback/game-feedback',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      }
    );

    const response = await submitGameFeedback(request);
    expect(response.status).toBe(201);

    const json = await response.json();
    expect(json.success).toBe(true);

    const feedback = await db.feedback.findUnique({
      where: { id: json.feedbackId },
    });
    expect(feedback).toBeTruthy();
    expect(feedback?.category).toBe('performance_issue');
    expect(feedback?.score).toBe(50); // default score when no rating
  });

  test('POST /api/feedback/game-feedback - rejects short description', async () => {
    const payload = {
      feedbackType: 'bug',
      description: 'Too short',
      stepsToReproduce: 'Steps here',
    };

    const request = new NextRequest(
      'http://localhost/api/feedback/game-feedback',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      }
    );

    const response = await submitGameFeedback(request);
    // Should fail validation - description must be at least 10 chars
    expect(response.status).toBe(400);
  });

  test('POST /api/feedback/game-feedback - bug report requires stepsToReproduce', async () => {
    const payload = {
      feedbackType: 'bug',
      description: 'This is a valid bug description that is long enough',
      // Missing stepsToReproduce
    };

    const request = new NextRequest(
      'http://localhost/api/feedback/game-feedback',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      }
    );

    const response = await submitGameFeedback(request);
    expect(response.status).toBe(400);
  });

  test('POST /api/feedback/game-feedback - feature request requires rating', async () => {
    const payload = {
      feedbackType: 'feature_request',
      description: 'This is a valid feature request description',
      // Missing rating
    };

    const request = new NextRequest(
      'http://localhost/api/feedback/game-feedback',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      }
    );

    const response = await submitGameFeedback(request);
    expect(response.status).toBe(400);
  });
});
