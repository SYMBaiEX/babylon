'use client';

import { cn } from '@babylon/shared';
import { type ComponentProps, memo } from 'react';
import { Streamdown } from 'streamdown';

type ResponseProps = ComponentProps<typeof Streamdown>;

/**
 * Markdown response component using streamdown
 *
 * Renders markdown content with proper styling for:
 * - Links (blue, underlined, accessible)
 * - Code blocks
 * - Lists
 * - Headers
 * - etc.
 */
export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        // Prose-like styling
        '[&_p]:leading-relaxed',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4',
        '[&_li]:my-1',
        // Headers
        '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:font-bold [&_h1]:text-xl',
        '[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:font-semibold [&_h2]:text-lg',
        '[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-medium [&_h3]:text-base',
        // Code
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        // High-contrast, accessible link styles
        '[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2',
        '[&_a]:text-blue-600 dark:[&_a]:text-blue-400',
        'hover:[&_a]:text-blue-500 dark:hover:[&_a]:text-blue-300',
        '[&_a]:decoration-blue-500/50 hover:[&_a]:decoration-2 dark:[&_a]:decoration-blue-400/60',
        'focus-visible:[&_a]:rounded-sm focus-visible:[&_a]:outline-none focus-visible:[&_a]:ring-1 focus-visible:[&_a]:ring-blue-400/40',
        '[&_a]:break-words',
        // Blockquote
        '[&_blockquote]:my-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic',
        // Strong/Bold
        '[&_strong]:font-semibold',
        // Horizontal rule
        '[&_hr]:my-4 [&_hr]:border-border',
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = 'Response';
