import type React from 'react';
import { cn } from '@babylon/shared';

/**
 * Props for the Button component.
 */
export interface ButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  /** Visual style variant */
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  /** Size variant */
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Button component for user interactions.
 *
 * A flexible button component that extends native button functionality
 * with variant and size options. Accepts all standard button props.
 *
 * @param props - Button component props
 * @returns Button element
 *
 * @example
 * ```tsx
 * <Button variant="default" size="lg" onClick={handleClick}>
 *   Click Me
 * </Button>
 * ```
 */
export const Button = ({
  children,
  variant: _variant,
  size: _size,
  className,
  ...props
}: ButtonProps) => {
  return (
    <button className={cn(className)} {...props}>
      {children}
    </button>
  );
};
export const buttonVariants = () => '';
