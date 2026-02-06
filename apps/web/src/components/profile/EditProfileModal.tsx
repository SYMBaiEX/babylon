'use client';

import { extractUsername } from '@babylon/shared';
import { Camera, User as UserIcon, X as XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

interface ProfileFormData {
  username: string;
  displayName: string;
  bio: string;
  profileImageUrl: string;
  coverImageUrl: string;
}

interface EditModalState {
  formData: ProfileFormData;
  profileImage: { file: File | null; preview: string | null };
  coverImage: { file: File | null; preview: string | null };
  isSaving: boolean;
  error: string | null;
}

export function EditProfileModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const { user, setUser } = useAuthStore();

  const initialFormData = useMemo<ProfileFormData>(() => {
    const username = user?.username ? extractUsername(user.username) : '';
    return {
      username,
      displayName: user?.displayName || '',
      bio: user?.bio || '',
      profileImageUrl: user?.profileImageUrl || '',
      coverImageUrl: user?.coverImageUrl || '',
    };
  }, [
    user?.username,
    user?.displayName,
    user?.bio,
    user?.profileImageUrl,
    user?.coverImageUrl,
  ]);

  const [state, setState] = useState<EditModalState>(() => ({
    formData: initialFormData,
    profileImage: { file: null, preview: null },
    coverImage: { file: null, preview: null },
    isSaving: false,
    error: null,
  }));

  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const coverImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setState({
      formData: initialFormData,
      profileImage: { file: null, preview: null },
      coverImage: { file: null, preview: null },
      isSaving: false,
      error: null,
    });
  }, [isOpen, initialFormData]);

  if (!isOpen) return null;

  const setFormField = (field: keyof ProfileFormData, value: string) => {
    setState((prev) => ({
      ...prev,
      formData: { ...prev.formData, [field]: value },
    }));
  };

  const handleImageSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'profile' | 'cover'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ];
    if (!allowedTypes.includes(file.type)) {
      setState((prev) => ({
        ...prev,
        error: 'Please select a valid image file',
      }));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setState((prev) => ({
        ...prev,
        error: 'File size must be less than 10MB',
      }));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setState((prev) => ({
        ...prev,
        ...(type === 'profile'
          ? { profileImage: { file, preview: reader.result as string } }
          : { coverImage: { file, preview: reader.result as string } }),
        error: null,
      }));
    };
    reader.readAsDataURL(file);
  };

  const close = () => {
    if (state.isSaving) return;
    if (profileImageInputRef.current) profileImageInputRef.current.value = '';
    if (coverImageInputRef.current) coverImageInputRef.current.value = '';
    onClose();
  };

  const saveProfile = async () => {
    if (!user?.id) return;

    setState((prev) => ({ ...prev, isSaving: true, error: null }));

    const token = await getAccessToken();
    const authHeaders: HeadersInit = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    const updatedData: Partial<ProfileFormData> = {
      ...state.formData,
      username: state.formData.username.trim(),
      displayName: state.formData.displayName.trim(),
      bio: state.formData.bio.trim(),
    };

    // Upload images if changed
    if (state.profileImage.file) {
      const formData = new FormData();
      formData.append('file', state.profileImage.file);
      formData.append('type', 'profile');

      const uploadResponse = await fetch('/api/upload/image', {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      if (!uploadResponse.ok) {
        const message = 'Failed to upload profile image';
        setState((prev) => ({ ...prev, error: message, isSaving: false }));
        return;
      }
      const uploadData = (await uploadResponse.json()) as { url?: string };
      if (uploadData.url) updatedData.profileImageUrl = uploadData.url;
    }

    if (state.coverImage.file) {
      const formData = new FormData();
      formData.append('file', state.coverImage.file);
      formData.append('type', 'cover');

      const uploadResponse = await fetch('/api/upload/image', {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      if (!uploadResponse.ok) {
        const message = 'Failed to upload cover image';
        setState((prev) => ({ ...prev, error: message, isSaving: false }));
        return;
      }
      const uploadData = (await uploadResponse.json()) as { url?: string };
      if (uploadData.url) updatedData.coverImageUrl = uploadData.url;
    }

    // Remove empty strings so backend can treat as "no change"
    (Object.keys(updatedData) as Array<keyof ProfileFormData>).forEach(
      (key) => {
        const val = updatedData[key];
        if (typeof val === 'string' && val.trim() === '') {
          delete updatedData[key];
        }
      }
    );

    const updateResponse = await fetch(
      `/api/users/${encodeURIComponent(user.id)}/update-profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(updatedData),
      }
    );

    const payload = (await updateResponse.json().catch(() => ({}))) as {
      user?: {
        username?: string | null;
        displayName?: string | null;
        bio?: string | null;
        profileImageUrl?: string | null;
        coverImageUrl?: string | null;
        profileComplete?: boolean;
        usernameChangedAt?: string | null;
        referralCode?: string | null;
        reputationPoints?: number | null;
        referralCount?: number | null;
      };
      error?: { message?: string };
    };

    if (!updateResponse.ok || !payload.user) {
      const message = payload?.error?.message || 'Failed to update profile';
      setState((prev) => ({ ...prev, error: message, isSaving: false }));
      return;
    }

    const previousUsername = user.username ?? null;
    const nextUsername = payload.user.username ?? null;
    const usernameChanged =
      previousUsername !== nextUsername && Boolean(nextUsername);

    setUser({
      ...user,
      username: payload.user.username ?? user.username,
      displayName: payload.user.displayName ?? user.displayName,
      bio: payload.user.bio ?? user.bio,
      profileImageUrl: payload.user.profileImageUrl ?? user.profileImageUrl,
      coverImageUrl: payload.user.coverImageUrl ?? user.coverImageUrl,
      profileComplete: payload.user.profileComplete ?? user.profileComplete,
      usernameChangedAt:
        payload.user.usernameChangedAt ?? user.usernameChangedAt,
      referralCode: payload.user.referralCode ?? user.referralCode,
      reputationPoints: payload.user.reputationPoints ?? user.reputationPoints,
      referralCount: payload.user.referralCount ?? user.referralCount,
    });

    setState((prev) => ({ ...prev, isSaving: false, error: null }));
    onClose();

    if (usernameChanged && nextUsername) {
      router.replace(
        `/profile/${encodeURIComponent(extractUsername(nextUsername))}`
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm md:px-4 md:py-3">
      <div className="flex h-full w-full flex-col border-0 bg-background md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-xl md:border md:border-border">
        <div className="sticky top-0 z-10 flex items-center justify-between border-border border-b bg-background px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              onClick={close}
              disabled={state.isSaving}
              className="shrink-0 rounded-full p-2 transition-colors hover:bg-muted active:bg-muted disabled:opacity-50"
              aria-label="Close"
            >
              <XIcon className="h-5 w-5" />
            </button>
            <h2 className="truncate font-bold text-lg sm:text-xl">
              Edit Profile
            </h2>
          </div>
          <button
            onClick={() => void saveProfile()}
            disabled={state.isSaving}
            className="min-h-[44px] shrink-0 rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm hover:bg-primary/90 active:bg-primary/90 disabled:opacity-50 sm:px-6"
          >
            {state.isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="relative h-32 bg-gradient-to-br from-primary/20 to-primary/5 sm:h-48">
            {state.coverImage.preview ? (
              <img
                src={state.coverImage.preview}
                alt="Cover preview"
                className="h-full w-full object-cover"
              />
            ) : state.formData.coverImageUrl ? (
              <img
                src={state.formData.coverImageUrl}
                alt="Cover"
                className="h-full w-full object-cover"
              />
            ) : null}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <input
                ref={coverImageInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                onChange={(e) => handleImageSelect(e, 'cover')}
                className="hidden"
                disabled={state.isSaving}
              />
              <button
                onClick={() => coverImageInputRef.current?.click()}
                disabled={state.isSaving}
                className="flex min-h-[44px] items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-primary-foreground transition-colors hover:bg-black/80 active:bg-black/80 disabled:opacity-50 sm:px-4"
                aria-label="Change cover photo"
              >
                <Camera className="h-4 w-4 shrink-0" />
                <span className="font-medium text-xs sm:text-sm">
                  {state.coverImage.preview || state.formData.coverImageUrl
                    ? 'Change'
                    : 'Add'}{' '}
                  cover
                </span>
              </button>
            </div>
          </div>

          <div className="-mt-12 sm:-mt-16 mb-6 px-4">
            <div className="relative h-24 w-24 sm:h-32 sm:w-32">
              {state.profileImage.preview ? (
                <img
                  src={state.profileImage.preview}
                  alt="Profile preview"
                  className="h-full w-full rounded-full border-4 border-background object-cover"
                />
              ) : state.formData.profileImageUrl ? (
                <img
                  src={state.formData.profileImageUrl}
                  alt="Profile"
                  className="h-full w-full rounded-full border-4 border-background object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-background bg-primary/20">
                  <UserIcon className="h-12 w-12 text-primary sm:h-16 sm:w-16" />
                </div>
              )}
              <input
                ref={profileImageInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                onChange={(e) => handleImageSelect(e, 'profile')}
                className="hidden"
                disabled={state.isSaving}
              />
              <button
                onClick={() => profileImageInputRef.current?.click()}
                disabled={state.isSaving}
                className="absolute right-0 bottom-0 rounded-full border-2 border-background bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:opacity-50 sm:hidden"
                aria-label="Change profile picture"
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                onClick={() => profileImageInputRef.current?.click()}
                disabled={state.isSaving}
                className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity hover:opacity-100 disabled:opacity-0 sm:flex"
                aria-label="Change profile picture"
              >
                <Camera className="h-6 w-6 text-foreground" />
              </button>
            </div>
          </div>

          <div className="space-y-5 px-4 pb-6">
            {state.error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive text-sm">
                {state.error}
              </div>
            )}

            <div className="space-y-2">
              <label className="font-medium text-sm">Display name</label>
              <input
                value={state.formData.displayName}
                onChange={(e) => setFormField('displayName', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="Your name"
                disabled={state.isSaving}
              />
            </div>

            <div className="space-y-2">
              <label className="font-medium text-sm">Username</label>
              <input
                value={state.formData.username}
                onChange={(e) => setFormField('username', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="username"
                disabled={state.isSaving}
              />
              <p className="text-muted-foreground text-xs">
                Shown as @{state.formData.username || 'username'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="font-medium text-sm">Bio</label>
              <textarea
                value={state.formData.bio}
                onChange={(e) => setFormField('bio', e.target.value)}
                className="min-h-24 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="Tell people about yourself"
                disabled={state.isSaving}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
