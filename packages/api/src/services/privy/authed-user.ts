import { db, eq, users } from '@babylon/db';
import { getPrivyClient } from '../../auth-middleware';
import { AuthenticationError } from '../../errors';

export type AuthedPrivyUserContext = {
  privyId: string;
  dbUserId: string;
  privyWalletId: string;
  walletAddress: string | null;
  isAdmin: boolean;
};

export async function getAuthedUserContextFromPrivyToken(
  privyToken: string
): Promise<AuthedPrivyUserContext> {
  if (!privyToken) {
    throw new AuthenticationError('Missing Privy token');
  }

  const privy = getPrivyClient();
  const claims = await privy.verifyAuthToken(privyToken);

  const [dbUser] = await db
    .select({
      id: users.id,
      privyWalletId: users.privyWalletId,
      walletAddress: users.walletAddress,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.privyId, claims.userId))
    .limit(1);

  if (!dbUser) {
    throw new AuthenticationError('User not found');
  }
  if (!dbUser.privyWalletId) {
    throw new AuthenticationError('Embedded wallet not ready');
  }

  return {
    privyId: claims.userId,
    dbUserId: dbUser.id,
    privyWalletId: dbUser.privyWalletId,
    walletAddress: dbUser.walletAddress,
    isAdmin: dbUser.isAdmin ?? false,
  };
}
