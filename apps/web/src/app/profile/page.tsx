'use client';

import { extractUsername } from '@babylon/shared';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageContainer } from '@/components/shared/PageContainer';
import { ProfileHeaderSkeleton } from '@/components/shared/Skeleton';
import { useAuth } from '@/hooks/useAuth';

/**
 * Legacy profile route.
 *
 * We keep `/profile` as a stable entry point (Sidebar, old links) and redirect
 * to the canonical user route.
 *
 * This route exists as a stable "My Profile" entry point (Sidebar, etc.) and
 * redirects to the username- or id-based profile page to avoid UI drift between
 * `/profile` and `/profile/[id]`.
 */
export default function ProfileRootRedirectPage() {
  const router = useRouter();
  const { ready, authenticated, user, login } = useAuth();

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !user?.id) {
      router.replace('/feed');
      // Match previous behavior: trigger login shortly after redirecting.
      const timer = window.setTimeout(() => login(), 500);
      return () => window.clearTimeout(timer);
    }

    const identifier = user.username ? extractUsername(user.username) : user.id;

    if (user.username) {
      router.replace(`/u/${encodeURIComponent(identifier)}`);
      return undefined;
    }

    router.replace(`/u/id/${encodeURIComponent(identifier)}`);
    return undefined;
  }, [ready, authenticated, user?.id, user?.username, router, login]);

  return (
    <PageContainer noPadding className="min-h-screen">
      <div className="mx-auto w-full max-w-[700px]">
        <ProfileHeaderSkeleton />
      </div>

      {/* Link Social Accounts Modal */}
      <LinkSocialAccountsModal
        isOpen={showLinkAccountsModal}
        onClose={() => setShowLinkAccountsModal(false)}
      />

      {/* Edit Profile Modal */}
      {editModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm md:px-4 md:py-3">
          <div className="flex h-full w-full flex-col border-0 bg-background md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-xl md:border md:border-border">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-border border-b bg-background px-4 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <button
                  onClick={closeEditModal}
                  disabled={editModal.isSaving}
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
                onClick={saveProfile}
                disabled={editModal.isSaving}
                className="min-h-[44px] shrink-0 rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm hover:bg-primary/90 active:bg-primary/90 disabled:opacity-50 sm:px-6"
              >
                {editModal.isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Cover Image Section */}
              <div className="relative h-32 bg-gradient-to-br from-primary/20 to-primary/5 sm:h-48">
                {editModal.coverImage.preview ? (
                  <img
                    src={editModal.coverImage.preview}
                    alt="Cover preview"
                    className="h-full w-full object-cover"
                  />
                ) : editModal.formData.coverImageUrl ? (
                  <img
                    src={editModal.formData.coverImageUrl}
                    alt="Cover"
                    className="h-full w-full object-cover"
                  />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <input
                    ref={coverImageInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                    onChange={handleCoverImageSelect}
                    className="hidden"
                    disabled={editModal.isSaving}
                  />
                  <button
                    onClick={() => coverImageInputRef.current?.click()}
                    disabled={editModal.isSaving}
                    className="flex min-h-[44px] items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-primary-foreground transition-colors hover:bg-black/80 active:bg-black/80 disabled:opacity-50 sm:px-4"
                    aria-label="Change cover photo"
                  >
                    <Camera className="h-4 w-4 shrink-0" />
                    <span className="font-medium text-xs sm:text-sm">
                      {editModal.coverImage.preview ||
                      editModal.formData.coverImageUrl
                        ? 'Change'
                        : 'Add'}{' '}
                      cover
                    </span>
                  </button>
                </div>
              </div>

              {/* Profile Image Section */}
              <div className="-mt-12 sm:-mt-16 mb-6 px-4">
                <div className="relative h-24 w-24 sm:h-32 sm:w-32">
                  {editModal.profileImage.preview ? (
                    <img
                      src={editModal.profileImage.preview}
                      alt="Profile preview"
                      className="h-full w-full rounded-full border-4 border-background object-cover"
                    />
                  ) : editModal.formData.profileImageUrl ? (
                    <img
                      src={editModal.formData.profileImageUrl}
                      alt="Profile"
                      className="h-full w-full rounded-full border-4 border-background object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-background bg-primary/20">
                      <User className="h-12 w-12 text-primary sm:h-16 sm:w-16" />
                    </div>
                  )}
                  <input
                    ref={profileImageInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                    onChange={handleProfileImageSelect}
                    className="hidden"
                    disabled={editModal.isSaving}
                  />
                  <button
                    onClick={() => profileImageInputRef.current?.click()}
                    disabled={editModal.isSaving}
                    className="absolute right-0 bottom-0 rounded-full border-2 border-background bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:opacity-50 sm:hidden"
                    aria-label="Change profile picture"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => profileImageInputRef.current?.click()}
                    disabled={editModal.isSaving}
                    className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity hover:opacity-100 disabled:opacity-0 sm:flex"
                    aria-label="Change profile picture"
                  >
                    <Camera className="h-6 w-6 text-foreground" />
                  </button>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-5 px-4 pb-6">
                {/* Error Message */}
                {editModal.error && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="text-sm">{editModal.error}</span>
                  </div>
                )}

                {/* Display Name */}
                <div>
                  <label
                    htmlFor="displayName"
                    className="mb-2 block font-medium text-muted-foreground text-sm"
                  >
                    Display Name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={editModal.formData.displayName}
                    onChange={(e) =>
                      setEditModal((prev) => ({
                        ...prev,
                        formData: {
                          ...prev.formData,
                          displayName: e.target.value,
                        },
                      }))
                    }
                    placeholder="Your name"
                    className="min-h-[44px] w-full rounded-lg border border-border bg-muted/50 px-4 py-3 text-base text-foreground focus:border-border focus:outline-none"
                    disabled={editModal.isSaving}
                  />
                </div>

                {/* Username */}
                <div>
                  <label
                    htmlFor="username"
                    className="mb-2 block font-medium text-muted-foreground text-sm"
                  >
                    Username
                  </label>
                  {usernameChangeLimit && !usernameChangeLimit.canChange && (
                    <div className="mb-2 flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-xs text-yellow-500 sm:text-sm">
                          Username can only be changed once every 24 hours
                        </p>
                        <p className="mt-0.5 text-muted-foreground text-xs">
                          Please wait {usernameChangeLimit.hours}h{' '}
                          {usernameChangeLimit.minutes}m
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 focus-within:border-border">
                    <span className="shrink-0 text-muted-foreground">@</span>
                    <input
                      id="username"
                      type="text"
                      value={editModal.formData.username}
                      onChange={(e) =>
                        setEditModal((prev) => ({
                          ...prev,
                          formData: {
                            ...prev.formData,
                            username: e.target.value,
                          },
                        }))
                      }
                      placeholder="username"
                      className="min-w-0 flex-1 bg-transparent text-base text-foreground focus:outline-none"
                      disabled={
                        editModal.isSaving ||
                        Boolean(
                          usernameChangeLimit && !usernameChangeLimit.canChange
                        )
                      }
                    />
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <label
                    htmlFor="bio"
                    className="mb-2 block font-medium text-muted-foreground text-sm"
                  >
                    Bio
                  </label>
                  <textarea
                    id="bio"
                    value={editModal.formData.bio}
                    onChange={(e) =>
                      setEditModal((prev) => ({
                        ...prev,
                        formData: {
                          ...prev.formData,
                          bio: e.target.value,
                        },
                      }))
                    }
                    placeholder="Tell us about yourself..."
                    rows={4}
                    maxLength={160}
                    className="w-full resize-none rounded-lg border border-border bg-muted/50 px-4 py-3 text-base text-foreground focus:border-border focus:outline-none"
                    disabled={editModal.isSaving}
                  />
                  <div className="mt-1 flex justify-end">
                    <span className="text-muted-foreground text-xs">
                      {editModal.formData.bio.length}/160
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Follow List Modal */}
      {user && (
        <FollowListModal
          isOpen={followListModal.isOpen}
          onClose={() =>
            setFollowListModal({ ...followListModal, isOpen: false })
          }
          userId={user.id}
          type={followListModal.type}
        />
      )}
    </PageContainer>
  );
}
