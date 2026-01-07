'use client';

import { cn } from '@babylon/shared';
import { useRouter } from 'next/navigation';
import { type ComponentProps, memo, useCallback } from 'react';
import { Streamdown } from 'streamdown';

type ResponseProps = ComponentProps<typeof Streamdown> & {
  onTagClick?: (tag: string) => void;
};

/**
 * Pre-processes text to convert @mentions and $cashtags into markdown links.
 * These links use special protocols that are intercepted on click.
 *
 * @mentions -> [mention](babylon://mention/username)
 * $cashtags -> [cashtag](babylon://cashtag/SYMBOL)
 */
function preprocessTags(text: string): string {
  if (!text || typeof text !== 'string') return text || '';

  // Match @mentions and $cashtags (excluding prices like $120k, $19.99)
  // @mentions: followed by word characters and hyphens
  // $cashtags: only match if followed by letters (not numbers)
  return text.replace(
    /(@[\w-]+)|(\$[A-Za-z][\w]*)/g,
    (match, mention, cashtag) => {
      if (mention) {
        // @username -> [@username](babylon://mention/username)
        const username = mention.slice(1); // Remove @
        return `[${mention}](babylon://mention/${username})`;
      }
      if (cashtag) {
        // $BTC -> [$BTC](babylon://cashtag/BTC)
        const symbol = cashtag.slice(1); // Remove $
        return `[${cashtag}](babylon://cashtag/${symbol})`;
      }
      return match;
    }
  );
}

/**
 * Markdown response component using streamdown with social tag support.
 *
 * Renders markdown content with proper styling for:
 * - Links (blue, underlined, accessible)
 * - Code blocks
 * - Lists
 * - Headers
 * - @mentions and $cashtags (clickable, navigates to profile/token page)
 *
 * @example
 * ```tsx
 * <Response onTagClick={(tag) => console.log('Clicked:', tag)}>
 *   Check out @username and $BTC for **great** returns!
 * </Response>
 * ```
 */
export const Response = memo(
  ({ className, children, onTagClick, ...props }: ResponseProps) => {
    const router = useRouter();

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;

        // Check if clicked element is a link with our special protocol
        if (target.tagName === 'A') {
          const href = target.getAttribute('href');
          if (href?.startsWith('babylon://')) {
            e.preventDefault();
            e.stopPropagation();

            const url = new URL(href);
            const type = url.host; // 'mention' or 'cashtag'
            const value = url.pathname.slice(1); // Remove leading /

            if (type === 'mention') {
              const tag = `@${value}`;
              if (onTagClick) {
                onTagClick(tag);
              } else {
                // Default: navigate to profile
                router.push(`/profile/${value}`);
              }
            } else if (type === 'cashtag') {
              const tag = `$${value}`;
              if (onTagClick) {
                onTagClick(tag);
              } else {
                // Default: navigate to token page
                router.push(`/tokens/${value}`);
              }
            }
          }
        }
      },
      [onTagClick, router]
    );

    // Pre-process children if it's a string
    const processedChildren =
      typeof children === 'string' ? preprocessTags(children) : children;

    return (
      <div onClick={handleClick}>
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
            // Tag links - styled like TaggedText
            '[&_a[href^="babylon://"]]:cursor-pointer [&_a[href^="babylon://"]]:font-medium',
            '[&_a[href^="babylon://"]]:text-[#0066FF] hover:[&_a[href^="babylon://"]]:text-[#2952d9]',
            '[&_a[href^="babylon://"]]:underline [&_a[href^="babylon://"]]:decoration-[#0066FF]/30',
            'hover:[&_a[href^="babylon://"]]:decoration-[#0066FF]/50',
            // Regular links - high-contrast, accessible styles
            '[&_a:not([href^="babylon://"])]:font-medium [&_a:not([href^="babylon://"])]:underline [&_a:not([href^="babylon://"])]:underline-offset-2',
            '[&_a:not([href^="babylon://"])]:text-blue-600 dark:[&_a:not([href^="babylon://"])]:text-blue-400',
            'hover:[&_a:not([href^="babylon://"])]:text-blue-500 dark:hover:[&_a:not([href^="babylon://"])]:text-blue-300',
            '[&_a:not([href^="babylon://"])]:decoration-blue-500/50 hover:[&_a:not([href^="babylon://"])]:decoration-2 dark:[&_a:not([href^="babylon://"])]:decoration-blue-400/60',
            'focus-visible:[&_a:not([href^="babylon://"])]:rounded-sm focus-visible:[&_a:not([href^="babylon://"])]:outline-none focus-visible:[&_a:not([href^="babylon://"])]:ring-1 focus-visible:[&_a:not([href^="babylon://"])]:ring-blue-400/40',
            '[&_a:not([href^="babylon://"])]:break-words',
            // Blockquote
            '[&_blockquote]:my-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic',
            // Strong/Bold
            '[&_strong]:font-semibold',
            // Horizontal rule
            '[&_hr]:my-4 [&_hr]:border-border',
            className
          )}
          {...props}
        >
          {processedChildren}
        </Streamdown>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.onTagClick === nextProps.onTagClick
);

Response.displayName = 'Response';
