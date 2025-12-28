import type { FeedbackType } from '@babylon/shared';

export type { FeedbackType };

export interface FeedbackData {
  id: string;
  feedbackType: FeedbackType;
  description: string;
  stepsToReproduce?: string | null;
  screenshotUrl?: string | null;
  rating?: number | null;
  userId: string;
  userEmail?: string | null;
}

const TYPE_CONFIG: Record<FeedbackType, { label: string; heading: string }> = {
  bug: { label: '🐛 Bug', heading: 'Bug Report' },
  feature_request: { label: '✨ Feature', heading: 'Feature Request' },
  performance: { label: '⚡ Performance', heading: 'Performance Issue' },
};

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
  const config = TYPE_CONFIG[feedback.feedbackType];

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

  lines.push(
    '---',
    '',
    '### Submission Details',
    '',
    `- **Submitted by:** ${safeEmail ?? 'Unknown'}`,
    `- **User ID:** \`${escapeHtml(feedback.userId)}\``,
    `- **Feedback ID:** \`${escapeHtml(feedback.id)}\``,
    `- **Type:** ${config.heading}`
  );

  return {
    title: `[${config.label}] ${truncatedDesc}`,
    description: lines.join('\n'),
  };
}
