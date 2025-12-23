export type FeedbackType = 'bug' | 'feature_request' | 'performance';

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

export function formatFeedbackForLinear(feedback: FeedbackData): {
  title: string;
  description: string;
} {
  const config = TYPE_CONFIG[feedback.feedbackType];
  const truncatedDesc =
    feedback.description.length > 80
      ? `${feedback.description.substring(0, 77)}...`
      : feedback.description;

  const lines: string[] = [
    `## ${config.heading}`,
    '',
    '### Description',
    '',
    feedback.description,
    '',
  ];

  if (feedback.stepsToReproduce) {
    lines.push('### Steps to Reproduce', '', feedback.stepsToReproduce, '');
  }

  if (feedback.screenshotUrl) {
    lines.push('### Screenshot', '', `![Screenshot](${feedback.screenshotUrl})`, '');
  }

  if (feedback.rating != null) {
    lines.push('### Importance Rating', '', `${'⭐'.repeat(feedback.rating)} (${feedback.rating}/5)`, '');
  }

  lines.push(
    '---',
    '',
    '### Submission Details',
    '',
    `- **Submitted by:** ${feedback.userEmail ?? 'Unknown'}`,
    `- **User ID:** \`${feedback.userId}\``,
    `- **Feedback ID:** \`${feedback.id}\``,
    `- **Type:** ${config.heading}`
  );

  return {
    title: `[${config.label}] ${truncatedDesc}`,
    description: lines.join('\n'),
  };
}
