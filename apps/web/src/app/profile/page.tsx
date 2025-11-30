'use client';

import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Trophy,
  User,
  X as XIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { PostCard } from '@/components/posts/PostCard';
import { LinkSocialAccountsModal } from '@/components/profile/LinkSocialAccountsModal';
import { OnChainBadge } from '@/components/profile/OnChainBadge';
import { TradingProfile } from '@/components/profile/TradingProfile';
import { PageContainer } from '@/components/shared/PageContainer';
import { Skeleton } from '@/components/shared/Skeleton';
import { TaggedText } from '@/components/shared/TaggedText';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@babylon/shared/client';
import { useAuthStore } from '@/stores/authStore';

interface ProfileFormData {
  username: string;
  displayName: string;
  bio: string;
  profileImageUrl: string;
  coverImageUrl: string;
}

interface SocialVisibility {
  twitter: boolean;
  farcaster: boolean;
  wallet: boolean;
}

interface EditModalState {
  isOpen: boolean;
  formData: ProfileFormData;
  profileImage: { file: File | null; preview: string | null };
  coverImage: { file: File | null; preview: string | null };
  isSaving: boolean;
  error: string | null;
}

export default function ProfilePage() {
  const { ready, authenticated, getAccessToken } = useAuth();
  const { user, setUser } = useAuthStore();
  const router = useRouter();

  const [formData, setFormData] = useState<ProfileFormData>({
    username: '',
    displayName: '',
    bio: '',
    profileImageUrl: '',
    coverImageUrl: '',
  });

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [optimisticFollowingCount, setOptimisticFollowingCount] = useState<
    number | null
  >(null);
  const [editModal, setEditModal] = useState<EditModalState>({
    isOpen: false,
    formData: {
      username: '',
      displayName: '',
      bio: '',
      profileImageUrl: '',
      coverImageUrl: '',
    },
    profileImage: { file: null, preview: null },
    coverImage: { file: null, preview: null },
    isSaving: false,
    error: null,
  });
  const [tab, setTab] = useState<'posts' | 'replies' | 'trades'>('posts');
  const [showLinkAccountsModal, setShowLinkAccountsModal] = useState(false);
  const [posts, setPosts] = useState<
    Array<{
      id: string;
      type?: string;
      content: string;
      fullContent?: string | null;
      articleTitle?: string | null;
      byline?: string | null;
      biasScore?: number | null;
      category?: string | null;
      timestamp: string;
      likeCount: number;
      commentCount: number;
      shareCount: number;
      authorId?: string;
      author?: {
        id?: string;
        displayName?: string | null;
        username?: string | null;
        profileImageUrl?: string | null;
      } | null;
      authorProfileImageUrl?: string | null;
      isLiked?: boolean;
      isShared?: boolean;
      // New clean repost structure
      isRepost?: boolean;
      isQuote?: boolean;
      quoteComment?: string | null;
      originalPostId?: string | null;
      originalPost?: {
        id: string;
        content: string;
        authorId: string;
        authorName: string;
        authorUsername: string | null;
        authorProfileImageUrl: string | null;
        timestamp: string;
      } | null;
    }>
  >([]);
  const [replies, setReplies] = useState<
    Array<{
      id: string;
      content: string;
      createdAt: string;
      likeCount: number;
      replyCount: number;
      postId: string;
      post: {
        author?: {
          displayName?: string | null;
          username?: string | null;
        } | null;
        content: string;
      };
    }>
  >([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // Social visibility toggles
  const [socialVisibility, setSocialVisibility] = useState<SocialVisibility>({
    twitter: true,
    farcaster: true,
    wallet: true,
  });

  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const coverImageInputRef = useRef<HTMLInputElement>(null);

  // Calculate time remaining until username can be changed again
  const getUsernameChangeTimeRemaining = (): {
    canChange: boolean;
    hours: number;
    minutes: number;
  } | null => {
    if (!user?.usernameChangedAt)
      return { canChange: true, hours: 0, minutes: 0 };

    const lastChangeTime = new Date(user.usernameChangedAt).getTime();
    const now = Date.now();
    const hoursSinceChange = (now - lastChangeTime) / (1000 * 60 * 60);
    const hoursRemaining = 24 - hoursSinceChange;

    if (hoursRemaining <= 0) {
      return { canChange: true, hours: 0, minutes: 0 };
    }

    return {
      canChange: false,
      hours: Math.floor(hoursRemaining),
      minutes: Math.floor((hoursRemaining - Math.floor(hoursRemaining)) * 60),
    };
  };

  const usernameChangeLimit = getUsernameChangeTimeRemaining();

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        displayName: user.displayName || '',
        bio: user.bio || '',
        profileImageUrl: user.profileImageUrl || '',
        coverImageUrl: user.coverImageUrl || '',
      });

      // Load visibility preferences from user
      setSocialVisibility({
        twitter: user.showTwitterPublic ?? true,
        farcaster: user.showFarcasterPublic ?? true,
        wallet: user.showWalletPublic ?? true,
      });

      setLoading(false);
    } else if (ready) {
      setLoading(false);
    }
  }, [user, ready]);

  // Load posts and replies when user or tab changes
  useEffect(() => {
    if (!user?.id) return;

    const loadContent = async () => {
      setLoadingPosts(true);
      const token = await getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `/api/users/${encodeURIComponent(user.id)}/posts?type=${tab}`,
        { headers }
      );
      if (response.ok) {
        const data = await response.json();
        const items = data?.data?.items ?? data?.items ?? [];
        if (tab === 'posts') {
          setPosts(items);
        } else {
          setReplies(items);
        }
      }
      setLoadingPosts(false);
    };

    loadContent();
  }, [user?.id, tab, getAccessToken]);

  // Listen for profile updates (when user follows/unfollows someone)
  useEffect(() => {
    const handleProfileUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { type } = customEvent.detail || {};

      if (type === 'follow' || type === 'unfollow') {
        // Update following count optimistically based on current displayed value
        const delta = type === 'follow' ? 1 : -1;
        setOptimisticFollowingCount((prev) => {
          const currentCount =
            prev !== null ? prev : user?.stats?.following || 0;
          return Math.max(0, currentCount + delta); // Never go negative
        });

        // Refetch user profile after a delay to get server values
        setTimeout(() => {
          setOptimisticFollowingCount(null);
          // Force auth store to refetch user data
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }, 2000);
      }
    };

    window.addEventListener('profile-updated', handleProfileUpdate);
    return () =>
      window.removeEventListener('profile-updated', handleProfileUpdate);
  }, [user?.stats?.following]);

  const openEditModal = () => {
    setEditModal({
      isOpen: true,
      formData: { ...formData },
      profileImage: { file: null, preview: null },
      coverImage: { file: null, preview: null },
      isSaving: false,
      error: null,
    });
  };

  const closeEditModal = () => {
    setEditModal({
      isOpen: false,
      formData: {
        username: '',
        displayName: '',
        bio: '',
        profileImageUrl: '',
        coverImageUrl: '',
      },
      profileImage: { file: null, preview: null },
      coverImage: { file: null, preview: null },
      isSaving: false,
      error: null,
    });
    if (profileImageInputRef.current) profileImageInputRef.current.value = '';
    if (coverImageInputRef.current) coverImageInputRef.current.value = '';
  };

  const handleProfileImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setEditModal((prev) => ({
        ...prev,
        error: 'Please select a valid image file',
      }));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setEditModal((prev) => ({
        ...prev,
        error: 'File size must be less than 10MB',
      }));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setEditModal((prev) => ({
        ...prev,
        profileImage: { file, preview: reader.result as string },
        error: null,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleCoverImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setEditModal((prev) => ({
        ...prev,
        error: 'Please select a valid image file',
      }));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setEditModal((prev) => ({
        ...prev,
        error: 'File size must be less than 10MB',
      }));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setEditModal((prev) => ({
        ...prev,
        coverImage: { file, preview: reader.result as string },
        error: null,
      }));
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    if (!user?.id) return;

    setEditModal((prev) => ({ ...prev, isSaving: true, error: null }));

    const token = await getAccessToken();
    const headers: HeadersInit = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    const updatedData = { ...editModal.formData };

    // Upload profile image if changed
    if (editModal.profileImage.file) {
      const formData = new FormData();
      formData.append('file', editModal.profileImage.file);
      formData.append('type', 'profile');

      const uploadResponse = await fetch('/api/upload/image', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!uploadResponse.ok) {
        const error = new Error('Failed to upload profile image');
        setEditModal((prev) => ({
          ...prev,
          error: error.message,
          isSaving: false,
        }));
        throw error;
      }
      const uploadData = await uploadResponse.json();
      updatedData.profileImageUrl = uploadData.url;
    }

    // Upload cover image if changed
    if (editModal.coverImage.file) {
      const formData = new FormData();
      formData.append('file', editModal.coverImage.file);
      formData.append('type', 'cover');

      const uploadResponse = await fetch('/api/upload/image', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!uploadResponse.ok) {
        const error = new Error('Failed to upload cover image');
        setEditModal((prev) => ({
          ...prev,
          error: error.message,
          isSaving: false,
        }));
        throw error;
      }
      const uploadData = await uploadResponse.json();
      updatedData.coverImageUrl = uploadData.url;
    }

    // Remove empty strings from updatedData (API expects valid URLs or undefined)
    Object.keys(updatedData).forEach((key) => {
      if (updatedData[key as keyof ProfileFormData] === '') {
        delete updatedData[key as keyof ProfileFormData];
      }
    });

    // Backend now handles ALL signing automatically - no user interaction needed!
    // This includes username changes, bio updates, everything.
    // The server signs the transaction on-chain, providing a seamless UX.

    const updateResponse = await fetch(
      `/api/users/${encodeURIComponent(user.id)}/update-profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updatedData),
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json().catch(() => ({}));
      const errorMessage =
        errorData?.error?.message || 'Failed to update profile';
      setEditModal((prev) => ({
        ...prev,
        error: errorMessage,
        isSaving: false,
      }));
      throw new Error(errorMessage);
    }
    const data = await updateResponse.json();

    setFormData({
      username: data.user.username,
      displayName: data.user.displayName,
      bio: data.user.bio,
      profileImageUrl: data.user.profileImageUrl,
      coverImageUrl: data.user.coverImageUrl || '',
    });

    const oldUsername = user.username;
    const newUsername = data.user.username;
    const usernameChanged = oldUsername !== newUsername && newUsername;

    setUser({
      ...user,
      username: data.user.username,
      displayName: data.user.displayName,
      bio: data.user.bio,
      profileImageUrl: data.user.profileImageUrl,
      coverImageUrl: data.user.coverImageUrl,
      profileComplete: data.user.profileComplete,
      usernameChangedAt: data.user.usernameChangedAt,
      referralCode: data.user.referralCode,
      reputationPoints: data.user.reputationPoints,
      referralCount: data.user.referralCount,
    });

    if (usernameChanged && newUsername) {
      const cleanUsername = newUsername.startsWith('@')
        ? newUsername.slice(1)
        : newUsername;
      router.replace(`/profile/${cleanUsername}`);
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    closeEditModal();
  };

  const toggleSocialVisibility = async (platform: keyof SocialVisibility) => {
    if (!user?.id) return;

    const newValue = !socialVisibility[platform];

    // Optimistic update
    setSocialVisibility((prev) => ({
      ...prev,
      [platform]: newValue,
    }));

    const token = await getAccessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(
      `/api/users/${encodeURIComponent(user.id)}/update-visibility`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          platform,
          visible: newValue,
        }),
      }
    );

    const data = await response.json();

    // Update user in store
    if (data.visibility) {
      setUser({
        ...user,
        showTwitterPublic: data.visibility.twitter,
        showFarcasterPublic: data.visibility.farcaster,
        showWalletPublic: data.visibility.wallet,
      });
    }
  };

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-full max-w-2xl space-y-4">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        ) : authenticated && user ? (
          <>
            {/* Profile Header - Style */}
            <div className="border-border border-b">
              <div className="mx-auto max-w-feed">
                {/* Cover Image */}
                <div className="relative h-32 bg-gradient-to-br from-primary/20 to-primary/5 sm:h-48">
                  {formData.coverImageUrl ? (
                    <img
                      src={formData.coverImageUrl}
                      alt="Cover"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>

                {/* Profile Info */}
                <div className="px-4 pb-4">
                  {/* Profile Picture & Edit Button Row */}
                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div className="-mt-12 sm:-mt-16 relative shrink-0">
                      {formData.profileImageUrl ? (
                        <img
                          src={formData.profileImageUrl}
                          alt={formData.displayName || 'Profile'}
                          className="h-24 w-24 rounded-full border-4 border-background object-cover sm:h-32 sm:w-32"
                        />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-background bg-primary/20 sm:h-32 sm:w-32">
                          <User className="h-12 w-12 text-primary sm:h-16 sm:w-16" />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={openEditModal}
                      className="min-h-[44px] whitespace-nowrap rounded-full border border-border bg-white px-4 py-2 font-semibold text-black text-sm transition-colors hover:bg-gray-100 active:bg-gray-100 sm:px-6 dark:bg-white dark:text-black dark:active:bg-gray-200 dark:hover:bg-gray-200"
                    >
                      Edit Profile
                    </button>
                  </div>

                  {/* Save Feedback */}
                  {saveSuccess && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-green-400">
                      <Check className="h-5 w-5" />
                      <span className="font-medium text-sm">
                        Profile updated successfully!
                      </span>
                    </div>
                  )}

                  {/* Display Name */}
                  <div className="mb-0.5 flex items-center gap-2">
                    <h2 className="font-bold text-foreground text-xl">
                      {formData.displayName || 'Your Name'}
                    </h2>
                    <OnChainBadge
                      isRegistered={user?.onChainRegistered ?? false}
                      nftTokenId={user?.nftTokenId}
                      size="md"
                    />
                  </div>

                  {/* Username */}
                  <p className="mb-3 text-muted-foreground text-sm">
                    @{formData.username || 'username'}
                  </p>

                  {/* Bio */}
                  {formData.bio && (
                    <p className="mb-3 whitespace-pre-wrap text-foreground text-sm">
                      {formData.bio}
                    </p>
                  )}

                  {/* Social Links Section */}
                  <div className="mb-3 space-y-2">
                    {/* Twitter/X */}
                    {user.hasTwitter && user.twitterUsername && (
                      <div className="group flex items-center justify-between">
                        <a
                          href={`https://x.com/${user.twitterUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-primary"
                        >
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                          </svg>
                          <span>@{user.twitterUsername}</span>
                          {socialVisibility.twitter && (
                            <ExternalLink className="h-3 w-3" />
                          )}
                        </a>
                        <button
                          onClick={() => toggleSocialVisibility('twitter')}
                          className="rounded p-1.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                          title={
                            socialVisibility.twitter ? 'Public' : 'Private'
                          }
                        >
                          {socialVisibility.twitter ? (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    )}

                    {/* Farcaster */}
                    {user.hasFarcaster && user.farcasterUsername && (
                      <div className="group flex items-center justify-between">
                        <a
                          href={`https://farcaster.xyz/${user.farcasterUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-primary"
                        >
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 1000 1000"
                            fill="currentColor"
                          >
                            <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
                            <path d="M128.889 253.333L157.778 351.111H182.222V844.444H128.889V253.333Z" />
                            <path d="M871.111 253.333L842.222 351.111H817.778V844.444H871.111V253.333Z" />
                          </svg>
                          <span>@{user.farcasterUsername}</span>
                          {socialVisibility.farcaster && (
                            <ExternalLink className="h-3 w-3" />
                          )}
                        </a>
                        <button
                          onClick={() => toggleSocialVisibility('farcaster')}
                          className="rounded p-1.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                          title={
                            socialVisibility.farcaster ? 'Public' : 'Private'
                          }
                        >
                          {socialVisibility.farcaster ? (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Metadata - Twitter Style */}
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
                    {user.createdAt && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        <span>
                          Joined{' '}
                          {new Date(user.createdAt).toLocaleDateString(
                            'en-US',
                            { month: 'long', year: 'numeric' }
                          )}
                        </span>
                      </div>
                    )}
                    {user.reputationPoints !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <Trophy className="h-4 w-4 text-yellow-500" />
                        <span className="font-medium text-foreground">
                          {user.reputationPoints.toLocaleString()} pts
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stats - Twitter Style */}
                  <div className="mb-4 flex gap-4 text-sm">
                    <button className="hover:underline">
                      <span className="font-bold text-foreground">
                        {optimisticFollowingCount !== null
                          ? optimisticFollowingCount
                          : user.stats?.following || 0}
                      </span>
                      <span className="ml-1 text-muted-foreground">
                        Following
                      </span>
                    </button>
                    <button className="hover:underline">
                      <span className="font-bold text-foreground">
                        {user.stats?.followers || 0}
                      </span>
                      <span className="ml-1 text-muted-foreground">
                        Followers
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs: Posts vs Replies vs Trades */}
            <div className="sticky top-0 z-10 border-border border-b bg-background/95 backdrop-blur-sm">
              <div className="mx-auto max-w-feed">
                <div className="flex">
                  <button
                    onClick={() => setTab('posts')}
                    className={cn(
                      'relative flex-1 py-4 font-semibold transition-colors hover:bg-muted/30',
                      tab === 'posts'
                        ? 'text-foreground opacity-100'
                        : 'text-foreground opacity-50'
                    )}
                  >
                    Posts
                  </button>
                  <button
                    onClick={() => setTab('replies')}
                    className={cn(
                      'relative flex-1 py-4 font-semibold transition-colors hover:bg-muted/30',
                      tab === 'replies'
                        ? 'text-foreground opacity-100'
                        : 'text-foreground opacity-50'
                    )}
                  >
                    Replies
                  </button>
                  <button
                    onClick={() => setTab('trades')}
                    className={cn(
                      'relative flex-1 py-4 font-semibold transition-colors hover:bg-muted/30',
                      tab === 'trades'
                        ? 'text-foreground opacity-100'
                        : 'text-foreground opacity-50'
                    )}
                  >
                    Trades
                  </button>
                </div>
              </div>
            </div>

            {/* Posts/Replies/Trades section */}
            <div className="mx-auto max-w-feed">
              {tab === 'trades' ? (
                <TradingProfile userId={user?.id} isOwner={true} />
              ) : loadingPosts ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-full max-w-2xl space-y-3">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                </div>
              ) : tab === 'posts' ? (
                posts.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <User className="mx-auto mb-3 h-12 w-12 opacity-50" />
                    <p className="text-sm">Your posts will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {posts.map((item) => {
                      const authorId =
                        item.authorId || item.author?.id || user?.id || '';
                      const authorName =
                        item.author?.displayName ||
                        item.author?.username ||
                        user?.displayName ||
                        user?.username ||
                        'You';
                      const authorUsername =
                        item.author?.username || user?.username || undefined;
                      const authorImage =
                        item.authorProfileImageUrl ||
                        item.author?.profileImageUrl ||
                        user?.profileImageUrl ||
                        undefined;

                      const postData = {
                        id: item.id,
                        type: item.type || 'post',
                        content: item.content,
                        fullContent: item.fullContent || null,
                        articleTitle: item.articleTitle || null,
                        byline: item.byline || null,
                        biasScore: item.biasScore ?? null,
                        category: item.category || null,
                        authorId,
                        authorName,
                        authorUsername,
                        authorProfileImageUrl: authorImage,
                        timestamp: item.timestamp,
                        likeCount: item.likeCount,
                        commentCount: item.commentCount,
                        shareCount: item.shareCount,
                        isLiked: item.isLiked,
                        isShared: item.isShared,
                        // Repost metadata
                        isRepost: item.isRepost || false,
                        isQuote: item.isQuote || false,
                        quoteComment: item.quoteComment || null,
                        originalPostId: item.originalPostId || null,
                        originalPost: item.originalPost || null,
                      };

                      return postData.type === 'article' ? (
                        <ArticleCard key={item.id} post={postData} />
                      ) : (
                        <PostCard
                          key={item.id}
                          post={postData}
                          showInteractions
                        />
                      );
                    })}
                  </div>
                )
              ) : replies.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <User className="mx-auto mb-3 h-12 w-12 opacity-50" />
                  <p className="text-sm">Your replies will appear here</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {replies.map((reply) => (
                    <div key={reply.id} className="px-4 py-4">
                      <div className="mb-2 whitespace-pre-wrap break-words text-foreground">
                        <TaggedText
                          text={reply.content}
                          onTagClick={(tag) => {
                            router.push(
                              `/feed?search=${encodeURIComponent(tag)}`
                            );
                          }}
                        />
                      </div>
                      <div className="mb-2 text-muted-foreground text-sm">
                        Replying to{' '}
                        <a
                          href={`/post/${reply.postId}`}
                          className="text-[#0066FF] hover:underline"
                        >
                          {reply.post.author?.displayName ||
                            reply.post.author?.username ||
                            'a post'}
                        </a>
                      </div>
                      <div className="mb-2 truncate text-muted-foreground text-xs">
                        <TaggedText
                          text={reply.post.content.substring(0, 100) + '...'}
                          onTagClick={(tag) => {
                            router.push(
                              `/feed?search=${encodeURIComponent(tag)}`
                            );
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-4 text-muted-foreground text-sm">
                        <span>
                          {new Date(reply.createdAt).toLocaleDateString()}
                        </span>
                        <span>❤️ {reply.likeCount || 0}</span>
                        <span>💬 {reply.replyCount || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Link Social Accounts Modal */}
            <LinkSocialAccountsModal
              isOpen={showLinkAccountsModal}
              onClose={() => setShowLinkAccountsModal(false)}
            />

            {/* Edit Profile Modal */}
            {editModal.isOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm md:px-4 md:py-3">
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
                        {/* Mobile: Always visible button, Desktop: Hover overlay */}
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
                        {usernameChangeLimit &&
                          !usernameChangeLimit.canChange && (
                            <div className="mb-2 flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-xs text-yellow-500 sm:text-sm">
                                  Username can only be changed once every 24
                                  hours
                                </p>
                                <p className="mt-0.5 text-muted-foreground text-xs">
                                  Please wait {usernameChangeLimit.hours}h{' '}
                                  {usernameChangeLimit.minutes}m
                                </p>
                              </div>
                            </div>
                          )}
                        <div className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 focus-within:border-border">
                          <span className="shrink-0 text-muted-foreground">
                            @
                          </span>
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
                                usernameChangeLimit &&
                                  !usernameChangeLimit.canChange
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
          </>
        ) : (
          <div className="mx-auto max-w-feed px-4 py-3">
            <div className="py-12 text-center text-muted-foreground">
              <User className="mx-auto mb-3 h-12 w-12 opacity-50" />
              <p>Please log in to view your profile.</p>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
