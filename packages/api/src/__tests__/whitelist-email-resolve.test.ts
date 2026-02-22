import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockGetUser = mock();
const mockGetAllVerifiedEmails = mock(() => [] as string[]);

mock.module('@babylon/shared', () => ({
  getAllVerifiedEmails: (...args: unknown[]) =>
    mockGetAllVerifiedEmails(
      ...(args as Parameters<typeof mockGetAllVerifiedEmails>)
    ),
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

mock.module('../auth-middleware', () => ({
  getPrivyClient: () => ({ getUser: mockGetUser }),
}));

const { resolveRecipientEmail } = await import('../services/email-utils');

describe('resolveRecipientEmail', () => {
  beforeEach(() => {
    mockGetUser.mockClear();
    mockGetAllVerifiedEmails.mockClear();
  });

  it('returns verified profile email directly', async () => {
    const result = await resolveRecipientEmail({
      id: 'user-1',
      email: 'verified@example.com',
      emailVerified: true,
      privyId: null,
    });

    expect(result).toBe('verified@example.com');
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('normalizes profile email to lowercase', async () => {
    const result = await resolveRecipientEmail({
      id: 'user-1',
      email: 'User@Example.COM',
      emailVerified: true,
      privyId: null,
    });

    expect(result).toBe('user@example.com');
  });

  it('returns null for unverified profile email without Privy fallback', async () => {
    const result = await resolveRecipientEmail({
      id: 'user-2',
      email: 'unverified@example.com',
      emailVerified: false,
      privyId: null,
    });

    expect(result).toBeNull();
  });

  it('falls back to Privy verified email when profile email is unverified', async () => {
    mockGetUser.mockResolvedValue({ linked_accounts: [] });
    mockGetAllVerifiedEmails.mockReturnValue(['privy@example.com']);

    const result = await resolveRecipientEmail({
      id: 'user-3',
      email: 'unverified@example.com',
      emailVerified: false,
      privyId: 'privy-123',
    });

    expect(mockGetUser).toHaveBeenCalledWith('privy-123');
    expect(result).toBe('privy@example.com');
  });

  it('returns null when Privy lookup fails and profile email is unverified', async () => {
    mockGetUser.mockRejectedValue(new Error('Privy down'));

    const result = await resolveRecipientEmail({
      id: 'user-4',
      email: 'unverified@example.com',
      emailVerified: false,
      privyId: 'privy-456',
    });

    expect(result).toBeNull();
  });

  it('returns null when Privy returns no verified emails and profile is unverified', async () => {
    mockGetUser.mockResolvedValue({ linked_accounts: [] });
    mockGetAllVerifiedEmails.mockReturnValue([]);

    const result = await resolveRecipientEmail({
      id: 'user-5',
      email: 'unverified@example.com',
      emailVerified: false,
      privyId: 'privy-789',
    });

    expect(result).toBeNull();
  });

  it('returns null when user has no email at all and no Privy', async () => {
    const result = await resolveRecipientEmail({
      id: 'user-6',
      email: null,
      emailVerified: false,
      privyId: null,
    });

    expect(result).toBeNull();
  });

  it('returns null when user has no email and Privy returns nothing', async () => {
    mockGetUser.mockResolvedValue({ linked_accounts: [] });
    mockGetAllVerifiedEmails.mockReturnValue([]);

    const result = await resolveRecipientEmail({
      id: 'user-7',
      email: null,
      emailVerified: false,
      privyId: 'privy-no-email',
    });

    expect(result).toBeNull();
  });

  it('returns Privy email when profile email is null but Privy has one', async () => {
    mockGetUser.mockResolvedValue({ linked_accounts: [] });
    mockGetAllVerifiedEmails.mockReturnValue(['fromPrivy@example.com']);

    const result = await resolveRecipientEmail({
      id: 'user-8',
      email: null,
      emailVerified: false,
      privyId: 'privy-with-email',
    });

    expect(result).toBe('fromprivy@example.com');
  });

  it('returns null for invalid profile email format even if marked verified', async () => {
    const result = await resolveRecipientEmail({
      id: 'user-9',
      email: 'not-an-email',
      emailVerified: true,
      privyId: null,
    });

    expect(result).toBeNull();
  });
});
