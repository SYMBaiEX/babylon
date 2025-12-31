import { FEEDBACK_TYPE_CONFIG, type FeedbackType } from '@babylon/shared';

export type { FeedbackType };

/** Base URL for user profile links */
const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://babylon.game';

export interface FeedbackData {
  id: string;
  feedbackType: FeedbackType;
  description: string;
  stepsToReproduce?: string | null;
  screenshotUrl?: string | null;
  rating?: number | null;
  userId: string;
  userEmail?: string | null;
  username?: string | null;
  displayName?: string | null;
  createdAt?: Date;
}

/**
 * Get formatted label with emoji for Linear issue titles.
 * Uses shared FEEDBACK_TYPE_CONFIG for DRY compliance.
 */
function getLinearLabel(feedbackType: FeedbackType): string {
  const config = FEEDBACK_TYPE_CONFIG[feedbackType];
  return `${config.emoji} ${config.heading.split(' ')[0]}`; // "🐛 Bug", "✨ Feature", "⚡ Performance"
}

/**
 * Escape HTML entities to prevent XSS in Linear's UI
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatFeedbackForLinear(feedback: FeedbackData): {
  title: string;
  description: string;
} {
  const config = FEEDBACK_TYPE_CONFIG[feedback.feedbackType];

  // Sanitize user-provided content to prevent XSS in Linear's UI
  const safeDescription = escapeHtml(feedback.description);
  const safeSteps = feedback.stepsToReproduce
    ? escapeHtml(feedback.stepsToReproduce)
    : null;
  const safeEmail = feedback.userEmail ? escapeHtml(feedback.userEmail) : null;

  const truncatedDesc =
    safeDescription.length > 80
      ? `${safeDescription.substring(0, 77)}...`
      : safeDescription;

  const lines: string[] = [
    `## ${config.heading}`,
    '',
    '### Description',
    '',
    safeDescription,
    '',
  ];

  if (safeSteps) {
    lines.push('### Steps to Reproduce', '', safeSteps, '');
  }

  if (feedback.screenshotUrl) {
    // URL is already validated by Zod schema, but escape for safety
    const safeUrl = escapeHtml(feedback.screenshotUrl);
    lines.push('### Screenshot', '', `![Screenshot](${safeUrl})`, '');
  }

  if (feedback.rating != null) {
    lines.push(
      '### Importance Rating',
      '',
      `${'⭐'.repeat(feedback.rating)} (${feedback.rating}/5)`,
      ''
    );
  }

  // Build "Submitted by" with profile link if username available
  let submittedBy: string;
  if (feedback.username) {
    const safeUsername = escapeHtml(feedback.username);
    const safeDisplayName = feedback.displayName
      ? escapeHtml(feedback.displayName)
      : safeUsername;
    // URL-encode username for safe profile links (handles %, #, ? etc.)
    const profileUrl = `${APP_BASE_URL}/profile/${encodeURIComponent(feedback.username)}`;
    submittedBy = `[${safeDisplayName}](${profileUrl}) (@${safeUsername})`;
  } else {
    submittedBy = safeEmail ?? 'Unknown';
  }

  // Format timestamp
  const timestamp = feedback.createdAt
    ? feedback.createdAt.toISOString().replace('T', ' ').substring(0, 19) +
      ' UTC'
    : 'Unknown';

  lines.push(
    '---',
    '',
    '### Submission Details',
    '',
    `- **Submitted by:** ${submittedBy}`,
    `- **Submitted at:** ${timestamp}`,
    `- **User ID:** \`${escapeHtml(feedback.userId)}\``,
    `- **Feedback ID:** \`${escapeHtml(feedback.id)}\``,
    `- **Type:** ${config.heading}`
  );

  return {
    title: `[${getLinearLabel(feedback.feedbackType)}] ${truncatedDesc}`,
    description: lines.join('\n'),
  };
}
