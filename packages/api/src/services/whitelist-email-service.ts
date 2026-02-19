import { db, inArray, users } from '@babylon/db';
import {
  getAllVerifiedEmails,
  logger,
  type PrivyUserWithEmails,
} from '@babylon/shared';
import { getPrivyNodeClient } from './privy/privy-node';

const WHITELIST_WELCOME_SUBJECT =
  "Congratulations, you're off the waitlist. You can play Babylon now.";

const WHITELIST_WELCOME_TEXT = [
  'Hey, you got in!',
  '',
  'Babylon is an AI-built world where humans and AI compete through prediction markets and perpetuals. You can create your own agent team and compete to win.',
  '',
  'Head to play.babylon.market, sign in, look around, then create one or two agents and tell them how they can help you win the game.',
  '',
  'Remember the best player get rewarded!',
  '',
  'Babylon team',
].join('\n');

const SEND_CONCURRENCY = 5;

type WhitelistRecipientRow = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  privyId: string | null;
};

function createWhitelistWelcomeHtml(): string {
  return [
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">',
    '  <p style="font-size:15px;line-height:1.6;color:#222;margin:0 0 16px;">Hey, you got in!</p>',
    '  <p style="font-size:15px;line-height:1.6;color:#222;margin:0 0 16px;">Babylon is an AI-built world where humans and AI compete through prediction markets and perpetuals. You can create your own agent team and compete to win.</p>',
    '  <p style="font-size:15px;line-height:1.6;color:#222;margin:0 0 16px;">Head to play.babylon.market, sign in, look around, then create one or two agents and tell them how they can help you win the game.</p>',
    '  <p style="font-size:15px;line-height:1.6;color:#222;margin:0 0 16px;">Remember the best player get rewarded!</p>',
    '  <p style="font-size:15px;line-height:1.6;color:#222;margin:0;">Babylon team</p>',
    '</div>',
  ].join('');
}

interface ParsedEmailAddress {
  email: string;
  name?: string;
}

function parseEmailAddress(rawValue: string): ParsedEmailAddress | null {
  const trimmed = rawValue.trim();

  const namedMatch = trimmed.match(
    /^(?<name>[^<>]+?)\s*<(?<email>[^<>\s@]+@[^<>\s@]+)>$/
  );

  const namedEmail = namedMatch?.groups?.email?.trim().toLowerCase();
  if (namedEmail) {
    const rawName = namedMatch?.groups?.name?.trim();
    const normalizedName = rawName?.replace(/^"|"$/g, '');
    return normalizedName
      ? { email: namedEmail, name: normalizedName }
      : { email: namedEmail };
  }

  const isPlainEmail = /^[^<>\s@]+@[^<>\s@]+$/.test(trimmed);
  if (isPlainEmail) {
    return { email: trimmed.toLowerCase() };
  }

  return null;
}

function normalizeEmail(rawEmail: string | null | undefined): string | null {
  if (!rawEmail) return null;
  const normalized = rawEmail.trim().toLowerCase();
  return /^[^<>\s@]+@[^<>\s@]+$/.test(normalized) ? normalized : null;
}

async function resolveRecipientEmail(
  recipient: WhitelistRecipientRow
): Promise<string | null> {
  const profileEmail = normalizeEmail(recipient.email);
  if (profileEmail && recipient.emailVerified) {
    return profileEmail;
  }

  if (recipient.privyId) {
    try {
      const privyUser = (await getPrivyNodeClient().getUser(
        recipient.privyId
      )) as PrivyUserWithEmails;
      const verifiedEmails = getAllVerifiedEmails(privyUser);
      const privyEmail = normalizeEmail(verifiedEmails[0]);
      if (privyEmail) {
        return privyEmail;
      }
    } catch (error) {
      logger.warn(
        'Failed to resolve whitelist recipient email from Privy',
        { userId: recipient.id, error: String(error) },
        'WhitelistEmailService'
      );
    }
  }

  return profileEmail;
}

async function sendWhitelistWelcomeEmail(input: {
  userId: string;
  userEmail: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!sendgridApiKey) {
    logger.debug(
      'Skipping whitelist welcome email: SENDGRID_API_KEY is not configured',
      { userId: input.userId },
      'WhitelistEmailService'
    );
    return { sent: false, reason: 'provider_not_configured' };
  }

  const fromAddress =
    process.env.NOTIFICATION_EMAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim();
  if (!fromAddress) {
    logger.warn(
      'Skipping whitelist welcome email: sender address is not configured',
      { userId: input.userId },
      'WhitelistEmailService'
    );
    return { sent: false, reason: 'sender_not_configured' };
  }

  const parsedFromAddress = parseEmailAddress(fromAddress);
  if (!parsedFromAddress) {
    logger.warn(
      'Skipping whitelist welcome email: sender address format is invalid',
      { userId: input.userId, fromAddress },
      'WhitelistEmailService'
    );
    return { sent: false, reason: 'sender_not_configured' };
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: parsedFromAddress,
        personalizations: [{ to: [{ email: input.userEmail }] }],
        subject: WHITELIST_WELCOME_SUBJECT,
        content: [
          { type: 'text/plain', value: WHITELIST_WELCOME_TEXT },
          { type: 'text/html', value: createWhitelistWelcomeHtml() },
        ],
      }),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      logger.warn(
        'Whitelist welcome email send failed',
        {
          userId: input.userId,
          status: response.status,
          responseBody,
        },
        'WhitelistEmailService'
      );
      return { sent: false, reason: 'provider_error' };
    }

    return { sent: true };
  } catch (error) {
    logger.error(
      'Whitelist welcome email request failed',
      { userId: input.userId, error: String(error) },
      'WhitelistEmailService'
    );
    return { sent: false, reason: 'provider_error' };
  }
}

async function fetchRecipients(
  userIds: string[]
): Promise<Map<string, WhitelistRecipientRow>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      privyId: users.privyId,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  return new Map(rows.map((row) => [row.id, row]));
}

async function sendWelcomeEmailForUser(
  userId: string,
  recipient: WhitelistRecipientRow | undefined
): Promise<'sent' | 'skipped' | 'failed'> {
  if (!recipient) {
    logger.warn(
      'Skipping whitelist welcome email: user not found',
      { userId },
      'WhitelistEmailService'
    );
    return 'skipped';
  }

  const resolvedEmail = await resolveRecipientEmail(recipient);
  if (!resolvedEmail) {
    logger.info(
      'Skipping whitelist welcome email: no email found for user',
      { userId },
      'WhitelistEmailService'
    );
    return 'skipped';
  }

  const result = await sendWhitelistWelcomeEmail({
    userId,
    userEmail: resolvedEmail,
  });

  if (result.sent) {
    return 'sent';
  }

  logger.warn(
    'Whitelist welcome email skipped by provider configuration or error',
    { userId, reason: result.reason ?? 'unknown' },
    'WhitelistEmailService'
  );
  return 'failed';
}

export async function sendWhitelistWelcomeEmailsToUsers(
  userIds: string[]
): Promise<void> {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return;

  const recipients = await fetchRecipients(uniqueUserIds);

  for (let i = 0; i < uniqueUserIds.length; i += SEND_CONCURRENCY) {
    const chunk = uniqueUserIds.slice(i, i + SEND_CONCURRENCY);

    const chunkResults = await Promise.all(
      chunk.map((userId) => sendWelcomeEmailForUser(userId, recipients.get(userId)))
    );

    const sentCount = chunkResults.filter((result) => result === 'sent').length;
    const skippedCount = chunkResults.filter(
      (result) => result === 'skipped'
    ).length;
    const failedCount = chunkResults.filter((result) => result === 'failed').length;

    if (sentCount > 0 || failedCount > 0 || skippedCount > 0) {
      logger.info(
        'Processed whitelist welcome email chunk',
        {
          chunkSize: chunk.length,
          sentCount,
          skippedCount,
          failedCount,
        },
        'WhitelistEmailService'
      );
    }
  }
}

export async function sendWhitelistWelcomeEmailToUser(
  userId: string
): Promise<void> {
  await sendWhitelistWelcomeEmailsToUsers([userId]);
}
