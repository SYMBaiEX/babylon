import React from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ children, className, ...props }: React.ComponentPropsWithoutRef<'div'>) => (
  <div className={cn(className)} {...props}>{children}</div>
);
export const CardHeader = ({ children, className, ...props }: React.ComponentPropsWithoutRef<'div'>) => (
  <div className={cn(className)} {...props}>{children}</div>
);
export const CardTitle = ({ children, className, ...props }: React.ComponentPropsWithoutRef<'h3'>) => (
  <h3 className={cn(className)} {...props}>{children}</h3>
);
export const CardContent = ({ children, className, ...props }: React.ComponentPropsWithoutRef<'div'>) => (
  <div className={cn(className)} {...props}>{children}</div>
);

