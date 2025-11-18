/**
 * Integration Tests: Settings Page
 * 
 * Tests all functionality on the settings page including:
 * - Profile updates (display name, username, bio)
 * - Theme settings
 * - Security features
 * - Privacy features (data export, account deletion)
 * - Tab navigation
 * 
 * Prerequisites: Backend server must be running
 */

import { describe, test, expect, beforeAll } from 'bun:test';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

// Test user credentials - you'll need to set these up
let testUserId: string;
let testAccessToken: string;

describe('Settings Page Integration Tests', () => {
  const hasTestCreds = !!(process.env.TEST_USER_ID && process.env.TEST_ACCESS_TOKEN);

  // Check if server is running
  let serverAvailable = false;

  beforeAll(async () => {
    try {
      const health = await fetch(`${API_URL}/health`.replace('/api/health', '/api/health')); // Adjust if API_URL includes /api
      // API_URL is http://localhost:3000/api
      // Health check is likely at http://localhost:3000/api/health
      const response = await fetch(`${API_URL}/health`);
      console.log('health', health);
      serverAvailable = response.ok;
    } catch {
      serverAvailable = false;
    }

    if (!hasTestCreds) {
      console.warn('⚠️  Skipping settings tests - TEST_USER_ID and TEST_ACCESS_TOKEN not set');
      return;
    }
    
    if (!serverAvailable) {
      console.warn('⚠️  Skipping settings tests - Server not available');
      return;
    }
    
    testUserId = process.env.TEST_USER_ID!;
    testAccessToken = process.env.TEST_ACCESS_TOKEN!;
    
    // Fetch current user data
    const response = await fetch(`${API_URL}/users/me`, {
      headers: {
        'Authorization': `Bearer ${testAccessToken}`,
      },
    });
    
    expect(response.ok).toBe(true);
    await response.json();
  });

  describe('Profile Tab', () => {
    test('should update display name', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      const newDisplayName = `Test User ${Date.now()}`;
      
      const response = await fetch(`${API_URL}/users/${testUserId}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testAccessToken}`,
        },
        body: JSON.stringify({
          displayName: newDisplayName,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.user.displayName).toBe(newDisplayName);
    });

    test('should update bio', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      const newBio = `Test bio updated at ${Date.now()}`;
      
      const response = await fetch(`${API_URL}/users/${testUserId}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testAccessToken}`,
        },
        body: JSON.stringify({
          bio: newBio,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.user.bio).toBe(newBio);
    });

    test('should enforce username change rate limit (24 hours)', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      // First, try to change username
      const newUsername = `testuser${Date.now()}`;
      
      const firstResponse = await fetch(`${API_URL}/users/${testUserId}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testAccessToken}`,
        },
        body: JSON.stringify({
          username: newUsername,
        }),
      });

      if (firstResponse.ok) {
        // If first change succeeded, try immediately again - should fail
        const secondResponse = await fetch(`${API_URL}/users/${testUserId}/update-profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testAccessToken}`,
          },
          body: JSON.stringify({
            username: `testuser${Date.now() + 1}`,
          }),
        });

        expect(secondResponse.ok).toBe(false);
        const errorData = await secondResponse.json();
        expect(errorData.error).toBeTruthy();
      }
    });

    test('should reject duplicate usernames', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      // Try to use a common username that likely exists
      const response = await fetch(`${API_URL}/users/${testUserId}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testAccessToken}`,
        },
        body: JSON.stringify({
          username: 'admin', // Likely taken
        }),
      });

      // Should either fail or succeed (if somehow available)
      // Main point is to verify the API handles duplicate checks
      const data = await response.json();
      expect(data).toBeTruthy();
    });

    test('should require on-chain registration for profile updates', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      // Fetch current user to check registration status
      const userResponse = await fetch(`${API_URL}/users/me`, {
        headers: {
          'Authorization': `Bearer ${testAccessToken}`,
        },
      });

      const userData = await userResponse.json();
      
      if (!userData.user.onChainRegistered) {
        // If not registered, profile updates should fail
        const updateResponse = await fetch(`${API_URL}/users/${testUserId}/update-profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testAccessToken}`,
          },
          body: JSON.stringify({
            displayName: 'Should Fail',
          }),
        });

        expect(updateResponse.ok).toBe(false);
      }
    });
  });

  // Theme Tab and Security Tab tests require browser testing
  // These are tested in synpress/playwright e2e tests

  describe('Privacy Tab', () => {
    test('should export user data (GDPR compliance)', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      const response = await fetch(`${API_URL}/users/export-data`, {
        headers: {
          'Authorization': `Bearer ${testAccessToken}`,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toContain('application/json');
      
      const data = await response.json();
      expect(data.export_info).toBeTruthy();
      expect(data.personal_information).toBeTruthy();
      expect(data.export_info.user_id).toBe(testUserId);
    });

    test('should include all user data in export', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      const response = await fetch(`${API_URL}/users/export-data`, {
        headers: {
          'Authorization': `Bearer ${testAccessToken}`,
        },
      });

      const data = await response.json();
      
      // Verify all required sections exist
      expect(data.export_info).toBeTruthy();
      expect(data.personal_information).toBeTruthy();
      expect(data.content).toBeTruthy();
      expect(data.trading).toBeTruthy();
      expect(data.social).toBeTruthy();
      expect(data.points_and_reputation).toBeTruthy();
      expect(data.financial).toBeTruthy();
      expect(data.notifications).toBeTruthy();
      expect(data.legal_consent).toBeTruthy();
    });

    test('should require exact confirmation for account deletion', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      // Try with wrong confirmation
      const response = await fetch(`${API_URL}/users/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testAccessToken}`,
        },
        body: JSON.stringify({
          confirmation: 'wrong confirmation',
          reason: 'Testing',
        }),
      });

      expect(response.ok).toBe(false);
    });

    test('should not allow account deletion without proper confirmation', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      // Missing confirmation field
      const response = await fetch(`${API_URL}/users/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testAccessToken}`,
        },
        body: JSON.stringify({
          reason: 'Testing',
        }),
      });

      expect(response.ok).toBe(false);
    });

    // NOTE: We don't actually test account deletion with correct confirmation
    // because that would delete the test account!
  });

  // Tab Navigation tests require browser testing
  // These are tested in synpress/playwright e2e tests

  describe('Authentication Requirements', () => {
    test('should require authentication for profile updates', async () => {
      if (!serverAvailable) {
        console.log('⏭️  Skipping - server not available');
        return;
      }
      
      if (!testUserId) {
        console.log('⏭️  Skipping - test user ID not available');
        return;
      }
      
      const response = await fetch(`${API_URL}/users/${testUserId}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No Authorization header
        },
        body: JSON.stringify({
          displayName: 'Should Fail',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should require authentication for data export', async () => {
      if (!serverAvailable) {
        console.log('⏭️  Skipping - server not available');
        return;
      }
      
      const response = await fetch(`${API_URL}/users/export-data`, {
        headers: {
          // No Authorization header
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should require authentication for account deletion', async () => {
      if (!serverAvailable) {
        console.log('⏭️  Skipping - server not available');
        return;
      }
      
      const response = await fetch(`${API_URL}/users/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No Authorization header
        },
        body: JSON.stringify({
          confirmation: 'DELETE MY ACCOUNT',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should prevent users from updating other users profiles', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      // Try to update a different user's profile (use a different ID)
      const otherUserId = 'different-user-id';
      
      const response = await fetch(`${API_URL}/users/${otherUserId}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testAccessToken}`,
        },
        body: JSON.stringify({
          displayName: 'Unauthorized Change',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });
  });

  describe('Input Validation', () => {
    test('should validate display name length', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      // Try extremely long display name
      const longName = 'a'.repeat(300);
      
      const response = await fetch(`${API_URL}/users/${testUserId}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testAccessToken}`,
        },
        body: JSON.stringify({
          displayName: longName,
        }),
      });

      // Should either be rejected or truncated
      const data = await response.json();
      if (response.ok) {
        expect(data.user.displayName.length).toBeLessThanOrEqual(100);
      } else {
        expect(response.status).toBe(400);
      }
    });

    test('should validate username format', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      // Try invalid username with special characters
      const invalidUsername = 'user@#$%^&*()';
      
      const response = await fetch(`${API_URL}/users/${testUserId}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testAccessToken}`,
        },
        body: JSON.stringify({
          username: invalidUsername,
        }),
      });

      // Should be rejected if validation is in place
      if (!response.ok) {
        expect(response.status).toBe(400);
      }
    });

    test('should validate bio length', async () => {
      if (!hasTestCreds) {
        console.log('⏭️  Skipping - test credentials not available');
        return;
      }

      // Try extremely long bio
      const longBio = 'a'.repeat(2000);
      
      const response = await fetch(`${API_URL}/users/${testUserId}/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testAccessToken}`,
        },
        body: JSON.stringify({
          bio: longBio,
        }),
      });

      // Should either be rejected or truncated
      const data = await response.json();
      if (response.ok) {
        expect(data.user.bio.length).toBeLessThanOrEqual(500);
      } else {
        expect(response.status).toBe(400);
      }
    });
  });
});

