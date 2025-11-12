import React from 'react';
import { cn } from '@/lib/utils';

export interface DialogProps extends React.ComponentPropsWithoutRef<'div'> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const Dialog = ({ children, open, onOpenChange: _onOpenChange, className, ...props }: DialogProps) => {
  if (!open) return null;
  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  );
};

export type DialogContentProps = React.ComponentPropsWithoutRef<'div'>;

export const DialogContent = ({ children, className, ...props }: DialogContentProps) => {
  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  );
};

export type DialogHeaderProps = React.ComponentPropsWithoutRef<'div'>;

export const DialogHeader = ({ children, className, ...props }: DialogHeaderProps) => {
  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  );
};

export type DialogTitleProps = React.ComponentPropsWithoutRef<'h2'>;

export const DialogTitle = ({ children, className, ...props }: DialogTitleProps) => {
  return (
    <h2 className={cn(className)} {...props}>
      {children}
    </h2>
  );
};

