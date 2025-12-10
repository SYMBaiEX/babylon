'use client';

import { cn } from '@babylon/shared';
import { Edit, RefreshCw } from 'lucide-react';
import { memo } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/ui/button';
import type { ProfileFormData } from '../hooks/useAgentForm';

interface ProfilePreviewCardProps {
  profileData: ProfileFormData;
  onEdit: () => void;
  onCycleProfilePic: () => void;
  onCycleBanner: () => void;
  isLoading?: boolean;
}

export const ProfilePreviewCard = memo(function ProfilePreviewCard({
  profileData,
  onEdit,
  onCycleProfilePic,
  onCycleBanner,
  isLoading = false,
}: ProfilePreviewCardProps) {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-border/50 bg-card">
        <div className="aspect-[3/1] animate-pulse bg-muted" />
        <div className="relative p-4 pt-12">
          <div className="-translate-y-1/2 absolute top-0">
            <div className="h-20 w-20 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="mt-2 space-y-2">
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-12 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-card">
      {/* Cover Image */}
      <div className="group relative aspect-[3/1] bg-gradient-to-r from-cyan-500/20 to-purple-500/20">
        {profileData.coverImageUrl && (
          <img
            src={profileData.coverImageUrl}
            alt="Cover"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
        <button
          onClick={onCycleBanner}
          className={cn(
            'absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100',
            'rounded-full bg-background/80 p-1.5 hover:bg-background'
          )}
          title="Cycle banner"
          type="button"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Profile Content */}
      <div className="relative p-4 pt-12">
        {/* Avatar */}
        <div className="group -translate-y-1/2 absolute top-0">
          <Avatar
            id={profileData.username || 'placeholder'}
            src={profileData.profileImageUrl || undefined}
            size="lg"
            className="ring-4 ring-background"
          />
          <button
            onClick={onCycleProfilePic}
            className={cn(
              'absolute right-0 bottom-0 opacity-0 transition-opacity group-hover:opacity-100',
              'rounded-full bg-background/80 p-1 hover:bg-background'
            )}
            title="Cycle profile picture"
            type="button"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        {/* Info */}
        <div className="mt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">
                {profileData.displayName || 'Agent Name'}
              </h3>
              <p className="text-muted-foreground text-sm">
                @{profileData.username || 'username'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="gap-1.5"
            >
              <Edit className="h-3 w-3" />
              Edit
            </Button>
          </div>

          {profileData.bio && (
            <p className="mt-3 line-clamp-3 text-muted-foreground text-sm">
              {profileData.bio}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});
