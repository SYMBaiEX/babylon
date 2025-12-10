'use client';

import { RefreshCw, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import type { ProfileFormData } from '../hooks/useAgentForm';

const TOTAL_PROFILE_PICTURES = 100;

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileData: ProfileFormData;
  onSave: (data: ProfileFormData) => void;
}

export function EditProfileModal({
  isOpen,
  onClose,
  profileData,
  onSave,
}: EditProfileModalProps) {
  const { getAccessToken } = useAuth();
  const [localData, setLocalData] = useState<ProfileFormData>(profileData);
  const [uploadingImage, setUploadingImage] = useState<
    'profile' | 'cover' | null
  >(null);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Sync when modal opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalData(profileData);
    } else {
      onClose();
    }
  };

  const cycleImage = useCallback(
    (type: 'profile' | 'cover') => {
      const current =
        type === 'profile'
          ? localData.profileImageUrl
          : localData.coverImageUrl;
      const basePath =
        type === 'profile'
          ? '/assets/user-profiles/profile-'
          : '/assets/user-banners/banner-';

      let nextIndex = Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1;

      // Avoid same image
      if (current?.includes(basePath)) {
        const match = current.match(/-(\d+)\.jpg/);
        if (match) {
          const currentIndex = parseInt(match[1]!, 10);
          while (nextIndex === currentIndex) {
            nextIndex = Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1;
          }
        }
      }

      const newUrl = `${basePath}${nextIndex}.jpg`;
      setLocalData((prev) => ({
        ...prev,
        [type === 'profile' ? 'profileImageUrl' : 'coverImageUrl']: newUrl,
      }));
    },
    [localData]
  );

  const handleImageUpload = useCallback(
    async (type: 'profile' | 'cover', file: File) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be smaller than 5MB');
        return;
      }

      if (
        !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(
          file.type
        )
      ) {
        toast.error('Please upload a valid image file');
        return;
      }

      setUploadingImage(type);

      const token = await getAccessToken();
      if (!token) {
        toast.error('Authentication required');
        setUploadingImage(null);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append(
        'type',
        type === 'profile' ? 'profileImage' : 'coverImage'
      );

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Upload failed');
        setUploadingImage(null);
        return;
      }

      const result = await response.json();
      setLocalData((prev) => ({
        ...prev,
        [type === 'profile' ? 'profileImageUrl' : 'coverImageUrl']: result.url,
      }));
      toast.success(
        `${type === 'profile' ? 'Profile' : 'Cover'} image uploaded`
      );
      setUploadingImage(null);
    },
    [getAccessToken]
  );

  const handleSave = () => {
    if (!localData.username.trim()) {
      toast.error('Username is required');
      return;
    }
    if (!localData.displayName.trim()) {
      toast.error('Display name is required');
      return;
    }
    onSave(localData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Agent Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Cover Image */}
          <div className="space-y-2">
            <Label>Cover Image</Label>
            <div className="group relative aspect-[3/1] overflow-hidden rounded-lg border border-border/50 bg-muted">
              {localData.coverImageUrl ? (
                <img
                  src={localData.coverImageUrl}
                  alt="Cover preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  No cover image
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => cycleImage('cover')}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Cycle
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploadingImage === 'cover'}
                >
                  <Upload className="mr-1 h-3 w-3" />
                  {uploadingImage === 'cover' ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload('cover', file);
                }}
              />
            </div>
          </div>

          {/* Profile Image */}
          <div className="space-y-2">
            <Label>Profile Image</Label>
            <div className="flex items-center gap-4">
              <div className="group relative">
                <Avatar
                  id={localData.username || 'placeholder'}
                  src={localData.profileImageUrl || undefined}
                  size="lg"
                  className="ring-2 ring-border"
                />
                <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => cycleImage('profile')}
                    className="rounded p-1 hover:bg-white/20"
                    title="Cycle"
                  >
                    <RefreshCw className="h-4 w-4 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => profileInputRef.current?.click()}
                    className="rounded p-1 hover:bg-white/20"
                    disabled={uploadingImage === 'profile'}
                    title="Upload"
                  >
                    <Upload className="h-4 w-4 text-white" />
                  </button>
                </div>
              </div>
              <input
                ref={profileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload('profile', file);
                }}
              />
              <div className="flex-1 text-muted-foreground text-xs">
                <p>Click to cycle or upload a custom image</p>
                <p>Max 5MB, JPG/PNG/GIF/WebP</p>
              </div>
            </div>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="edit-username">Username *</Label>
            <div className="flex items-center">
              <span className="rounded-l-md border border-input border-r-0 bg-muted px-3 py-2 text-muted-foreground text-sm">
                @
              </span>
              <Input
                id="edit-username"
                value={localData.username}
                onChange={(e) =>
                  setLocalData((prev) => ({
                    ...prev,
                    username: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, ''),
                  }))
                }
                className="rounded-l-none"
                placeholder="agent_username"
              />
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-displayName">Display Name *</Label>
            <Input
              id="edit-displayName"
              value={localData.displayName}
              onChange={(e) =>
                setLocalData((prev) => ({
                  ...prev,
                  displayName: e.target.value,
                }))
              }
              placeholder="My Awesome Agent"
            />
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="edit-bio">Bio</Label>
            <Textarea
              id="edit-bio"
              value={localData.bio}
              onChange={(e) =>
                setLocalData((prev) => ({ ...prev, bio: e.target.value }))
              }
              placeholder="A brief description of your agent..."
              rows={3}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Profile</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
