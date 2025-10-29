'use client';

import { cn } from '@/lib/utils';
import { Bookmark } from 'lucide-react';
import { useState } from 'react';
import { useInteractionStore } from '@/stores/interactionStore';
import type { FavoriteButtonProps } from '@/types/interactions';

const sizeClasses = {
  sm: {
    icon: 'h-8 w-8',
    button: 'h-8 px-3 text-xs',
  },
  md: {
    icon: 'h-10 w-10',
    button: 'h-10 px-4 text-sm',
  },
  lg: {
    icon: 'h-12 w-12',
    button: 'h-12 px-5 text-base',
  },
};

const iconSizes = {
  sm: 16,
  md: 18,
  lg: 20,
};

export function FavoriteButton({
  profileId,
  initialFavorited = false,
  size = 'md',
  variant = 'button',
  className,
}: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isAnimating, setIsAnimating] = useState(false);

  const { toggleFavorite } = useInteractionStore();

  const handleClick = async () => {
    const wasFavorited = isFavorited;

    // Optimistic update
    setIsFavorited(!wasFavorited);

    // Trigger animation
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    try {
      await toggleFavorite(profileId);
    } catch (error) {
      // Rollback on error
      setIsFavorited(wasFavorited);
      console.error('Failed to toggle favorite:', error);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'flex items-center justify-center rounded-full transition-all duration-200',
          'border border-transparent',
          isFavorited
            ? 'text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20'
            : 'text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10',
          sizeClasses[size].icon,
          isAnimating && 'scale-110',
          className
        )}
        title={isFavorited ? 'Unfollow' : 'Follow'}
      >
        <Bookmark
          size={iconSizes[size]}
          className={cn(
            'transition-all duration-200',
            isFavorited && 'fill-current',
            isAnimating && 'animate-bounce'
          )}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 rounded-full transition-all duration-200',
        'border',
        isFavorited
          ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20'
          : 'text-foreground border-border hover:bg-muted',
        sizeClasses[size].button,
        isAnimating && 'scale-105',
        'font-medium',
        className
      )}
    >
      <Bookmark
        size={iconSizes[size]}
        className={cn(
          'transition-all duration-200',
          isFavorited && 'fill-current',
          isAnimating && 'animate-bounce'
        )}
      />
      <span>{isFavorited ? 'Following' : 'Follow'}</span>
    </button>
  );
}
