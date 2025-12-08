/**
 * User Management Utilities
 *
 * @description Exports for user management, lookup, and authentication utilities.
 */

export {
  type CanonicalUser,
  type EnsureUserOptions,
  ensureUserForAuth,
  getCanonicalUserId,
} from './ensure-user';

export {
  findUserByIdentifier,
  findUserByIdentifierWithSelect,
  requireUserByIdentifier,
} from './user-lookup';
