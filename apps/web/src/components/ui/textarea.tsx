import type React from 'react';
import { cn } from '@babylon/shared/client';

/**
 * Textarea component for multi-line text input.
 *
 * Simple textarea wrapper that extends standard textarea HTML attributes.
 * Styling is handled via className.
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
  return <textarea className={cn(className)} {...props} />;
};
