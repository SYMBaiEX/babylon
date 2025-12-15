import { cn } from '@babylon/shared';
import type React from 'react';

/**
 * Textarea component for multi-line text input.
 *
 * Simple textarea wrapper that extends standard textarea HTML attributes.
 * Includes responsive default styling for consistency across the app.
 *
 * @param props - Textarea component props
 * @returns Textarea element
 *
 * @example
 * ```tsx
 * <Textarea placeholder="Enter text..." rows={4} />
 * ```
 */
export type TextareaProps = React.ComponentPropsWithoutRef<'textarea'>;

export const Textarea = ({ className, ...props }: TextareaProps) => {
  return (
    <textarea
      className={cn(
        'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'min-h-[80px] resize-y',
        className
      )}
      {...props}
    />
  );
};
