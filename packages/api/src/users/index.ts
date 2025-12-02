/**
 * User Management Utilities
 *
 * @description Exports for user management, lookup, and authentication utilities.
 */

export {
  ensureUserForAuth,
  getCanonicalUserId,
  type CanonicalUser,
  type EnsureUserOptions,
} from './ensure-user';

export {
  findUserByIdentifier,
  findUserByIdentifierWithSelect,
  requireUserByIdentifier,
} from './user-lookup';

