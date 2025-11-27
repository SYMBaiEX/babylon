import type { InferSelectModel } from 'drizzle-orm';
import type { SelectedFields } from 'drizzle-orm/pg-core';
import { db, eq, or, users } from '@/db';
import { NotFoundError } from '@/lib/errors';

type User = InferSelectModel<typeof users>;

/**
 * Find user by identifier (ID, privyId, or username)
 * @param identifier - The user ID, privyId, or username
 * @param _select - Optional select fields (for compatibility, currently ignored - returns full user)
 */
export async function findUserByIdentifier(
  identifier: string,

  _select?: Record<string, boolean>
): Promise<User | null> {
  // Try to find by ID, privyId, or username
  const [user] = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.id, identifier),
        eq(users.privyId, identifier),
        eq(users.username, identifier)
      )
    )
    .limit(1);

  return user ?? null;
}

export async function findUserByIdentifierWithSelect<
  T extends Record<string, unknown>,
>(identifier: string, select: T): Promise<T | null> {
  // Drizzle's select() accepts SelectedFields which is compatible with our select object
  // The select object contains column references which satisfy SelectedFields requirements
  const [user] = await db
    .select(select as SelectedFields)
    .from(users)
    .where(
      or(
        eq(users.id, identifier),
        eq(users.privyId, identifier),
        eq(users.username, identifier)
      )
    )
    .limit(1);

  // Type-safe generic return - user matches T if T extends User
  // This is safe because we're selecting all fields and T should be a subset of User
  if (!user) return null;
  return user as T;
}

export async function requireUserByIdentifier(
  identifier: string,

  _select?: Record<string, boolean>
): Promise<User> {
  const user = await findUserByIdentifier(identifier);
  if (!user) {
    throw new NotFoundError('User', identifier);
  }
  return user;
}
