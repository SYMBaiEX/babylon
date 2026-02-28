/**
 * Shared helpers for integration tests (auth, server checks).
 * Use so tests don't repeat the same requireAuth/requireServer logic.
 */

const DEFAULT_BASE_URL =
  process.env.TEST_API_URL ||
  process.env.TEST_BASE_URL ||
  'http://localhost:3000';

export function requireServer(
  serverAvailable: boolean,
  baseUrl: string = DEFAULT_BASE_URL
): void {
  if (!serverAvailable) {
    throw new Error(`TEST SKIPPED: Server not available at ${baseUrl}`);
  }
}

export function requireAuth(
  serverAvailable: boolean,
  devAdminToken: string | null,
  baseUrl: string = DEFAULT_BASE_URL
): void {
  requireServer(serverAvailable, baseUrl);
  if (!devAdminToken) {
    throw new Error('TEST SKIPPED: Dev admin token not available');
  }
}
