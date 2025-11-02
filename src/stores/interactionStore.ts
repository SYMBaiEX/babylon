/**
 * Interaction Store - Manages social interactions with optimistic updates
 * Handles: likes, comments, shares, and favorites with real-time polling
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  PostInteraction,
  CommentInteraction,
  CommentWithReplies,
  CommentData,
  FavoriteProfile,
  PendingInteraction,
  InteractionError,
} from '@/types/interactions';
import { logger } from '@/lib/logger';
import { retryIfRetryable } from '@/lib/retry';

interface InteractionStoreState {
  // State maps
  postInteractions: Map<string, PostInteraction>;
  commentInteractions: Map<string, CommentInteraction>;
  favoritedProfiles: Set<string>;
  pendingInteractions: Map<string, PendingInteraction>;


  // Loading states
  loadingStates: Map<string, boolean>;

  // Error states
  errors: Map<string, InteractionError>;
}

interface InteractionStoreActions {
  // Like actions
  toggleLike: (postId: string) => Promise<void>;
  toggleCommentLike: (commentId: string) => Promise<void>;

  // Comment actions
  addComment: (postId: string, content: string, parentId?: string) => Promise<CommentData | null>;
  editComment: (commentId: string, content: string) => Promise<void>;
  deleteComment: (commentId: string, postId?: string) => Promise<void>;
  loadComments: (postId: string) => Promise<CommentWithReplies[]>;

  // Share actions
  toggleShare: (postId: string) => Promise<void>;

  // Favorite actions
  toggleFavorite: (profileId: string) => Promise<void>;
  loadFavorites: () => Promise<FavoriteProfile[]>;

  // Utility actions
  clearError: (id: string) => void;
  resetStore: () => void;
  getPostInteraction: (postId: string) => PostInteraction | null;
  getCommentInteraction: (commentId: string) => CommentInteraction | null;
  isFavorited: (profileId: string) => boolean;
  setLoading: (id: string, loading: boolean) => void;
  setError: (id: string, error: InteractionError) => void;
}

type InteractionStore = InteractionStoreState & InteractionStoreActions;

// Helper to get auth token from Privy
async function getAuthToken(): Promise<string | null> {
  try {
    // Access the token from window object that gets set by useAuth hook
    if (typeof window !== 'undefined' && window.__privyAccessToken) {
      return window.__privyAccessToken;
    }
    
    return null;
  } catch (error) {
    logger.error('Error getting auth token:', error, 'InteractionStore');
    return null;
  }
}

// Helper to make API calls with auth and retry logic
async function apiCall<T>(url: string, options: RequestInit = {}): Promise<T> {
  return retryIfRetryable(async () => {
    const token = await getAuthToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API call failed: ${response.statusText}`);
    }

    return response.json();
  }, {
    maxAttempts: 3,
    initialDelay: 1000,
    onRetry: (attempt, error) => {
      logger.debug(`Retrying API call to ${url}`, { attempt, error: error.message }, 'InteractionStore');
    },
  });
}

export const useInteractionStore = create<InteractionStore>()(
  persist(
    (set, get) => ({
      // Initial state
      postInteractions: new Map(),
      commentInteractions: new Map(),
      favoritedProfiles: new Set(),
      pendingInteractions: new Map(),
      loadingStates: new Map(),
      errors: new Map(),

      // Like actions
      toggleLike: async (postId: string) => {
        const { postInteractions, setLoading, setError } = get();
        const currentInteraction = postInteractions.get(postId) || {
          postId,
          likeCount: 0,
          commentCount: 0,
          shareCount: 0,
          isLiked: false,
          isShared: false,
        };

        const wasLiked = currentInteraction.isLiked;
        const optimisticCount = wasLiked
          ? currentInteraction.likeCount - 1
          : currentInteraction.likeCount + 1;

        // Optimistic update
        const optimisticInteraction: PostInteraction = {
          ...currentInteraction,
          isLiked: !wasLiked,
          likeCount: Math.max(0, optimisticCount),
        };

        set((state) => ({
          postInteractions: new Map(state.postInteractions).set(postId, optimisticInteraction),
        }));

        setLoading(postId, true);

        try {
          const method = wasLiked ? 'DELETE' : 'POST';
          const response = await apiCall<{ data: { likeCount: number; isLiked: boolean } }>(
            `/api/posts/${postId}/like`,
            { method }
          );

          // Update with server response
          set((state) => ({
            postInteractions: new Map(state.postInteractions).set(postId, {
              ...currentInteraction,
              likeCount: response.data.likeCount,
              isLiked: response.data.isLiked,
            }),
          }));
        } catch (error) {
          // Rollback on error
          set((state) => ({
            postInteractions: new Map(state.postInteractions).set(postId, currentInteraction),
          }));

          setError(postId, {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to toggle like',
          });
        } finally {
          setLoading(postId, false);
        }
      },

      toggleCommentLike: async (commentId: string) => {
        const { commentInteractions, setLoading, setError } = get();
        const currentInteraction = commentInteractions.get(commentId) || {
          commentId,
          likeCount: 0,
          replyCount: 0,
          isLiked: false,
        };

        const wasLiked = currentInteraction.isLiked;
        const optimisticCount = wasLiked
          ? currentInteraction.likeCount - 1
          : currentInteraction.likeCount + 1;

        // Optimistic update
        const optimisticInteraction: CommentInteraction = {
          ...currentInteraction,
          isLiked: !wasLiked,
          likeCount: Math.max(0, optimisticCount),
        };

        set((state) => ({
          commentInteractions: new Map(state.commentInteractions).set(
            commentId,
            optimisticInteraction
          ),
        }));

        setLoading(commentId, true);

        try {
          const method = wasLiked ? 'DELETE' : 'POST';
          const response = await apiCall<{ data: { likeCount: number; isLiked: boolean } }>(
            `/api/comments/${commentId}/like`,
            { method }
          );

          // Update with server response
          set((state) => ({
            commentInteractions: new Map(state.commentInteractions).set(commentId, {
              ...currentInteraction,
              likeCount: response.data.likeCount,
              isLiked: response.data.isLiked,
            }),
          }));
        } catch (error) {
          // Rollback on error
          set((state) => ({
            commentInteractions: new Map(state.commentInteractions).set(
              commentId,
              currentInteraction
            ),
          }));

          setError(commentId, {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to toggle comment like',
          });
        } finally {
          setLoading(commentId, false);
        }
      },

      // Comment actions
      addComment: async (postId: string, content: string, parentId?: string) => {
        const { setLoading, setError, postInteractions } = get();
        const loadingKey = `comment-${postId}-${parentId || 'root'}`;

        setLoading(loadingKey, true);

        try {
          const response = await apiCall<{ data: CommentData }>(
            `/api/posts/${postId}/comments`,
            {
              method: 'POST',
              body: JSON.stringify({ content, parentCommentId: parentId }),
            }
          );

          // Increment comment count for the post (only for top-level comments)
          if (!parentId) {
            const currentInteraction = postInteractions.get(postId);
            if (currentInteraction) {
              set((state) => ({
                postInteractions: new Map(state.postInteractions).set(postId, {
                  ...currentInteraction,
                  commentCount: currentInteraction.commentCount + 1,
                }),
              }));
            }
          }

          return response.data;
        } catch (error) {
          setError(loadingKey, {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to add comment',
          });
          return null;
        } finally {
          setLoading(loadingKey, false);
        }
      },

      editComment: async (commentId: string, content: string) => {
        const { setLoading, setError } = get();
        const loadingKey = `edit-comment-${commentId}`;

        setLoading(loadingKey, true);

        try {
          await apiCall(`/api/comments/${commentId}`, {
            method: 'PATCH',
            body: JSON.stringify({ content }),
          });
        } catch (error) {
          setError(loadingKey, {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to edit comment',
          });
          throw error;
        } finally {
          setLoading(loadingKey, false);
        }
      },

      deleteComment: async (commentId: string, postId?: string) => {
        const { setLoading, setError, postInteractions } = get();
        const loadingKey = `delete-comment-${commentId}`;

        setLoading(loadingKey, true);

        try {
          await apiCall(`/api/comments/${commentId}`, {
            method: 'DELETE',
          });

          // Decrement comment count if postId provided
          if (postId) {
            const currentInteraction = postInteractions.get(postId);
            if (currentInteraction && currentInteraction.commentCount > 0) {
              set((state) => ({
                postInteractions: new Map(state.postInteractions).set(postId, {
                  ...currentInteraction,
                  commentCount: currentInteraction.commentCount - 1,
                }),
              }));
            }
          }
        } catch (error) {
          setError(loadingKey, {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to delete comment',
          });
          throw error;
        } finally {
          setLoading(loadingKey, false);
        }
      },

      loadComments: async (postId: string) => {
        const { setLoading, setError } = get();
        const loadingKey = `load-comments-${postId}`;

        setLoading(loadingKey, true);

        try {
          const response = await apiCall<{ data: { comments: CommentWithReplies[] } }>(
            `/api/posts/${postId}/comments`
          );
          return response.data.comments;
        } catch (error) {
          setError(loadingKey, {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to load comments',
          });
          return [];
        } finally {
          setLoading(loadingKey, false);
        }
      },

      // Share actions
      toggleShare: async (postId: string) => {
        const { postInteractions, setLoading, setError } = get();
        const currentInteraction = postInteractions.get(postId) || {
          postId,
          likeCount: 0,
          commentCount: 0,
          shareCount: 0,
          isLiked: false,
          isShared: false,
        };

        const wasShared = currentInteraction.isShared;
        const optimisticCount = wasShared
          ? currentInteraction.shareCount - 1
          : currentInteraction.shareCount + 1;

        // Optimistic update
        const optimisticInteraction: PostInteraction = {
          ...currentInteraction,
          isShared: !wasShared,
          shareCount: Math.max(0, optimisticCount),
        };

        set((state) => ({
          postInteractions: new Map(state.postInteractions).set(postId, optimisticInteraction),
        }));

        setLoading(`share-${postId}`, true);

        try {
          const method = wasShared ? 'DELETE' : 'POST';
          const response = await apiCall<{ data: { shareCount: number; isShared: boolean } }>(
            `/api/posts/${postId}/share`,
            { method }
          );

          // Update with server response
          set((state) => ({
            postInteractions: new Map(state.postInteractions).set(postId, {
              ...currentInteraction,
              shareCount: response.data.shareCount,
              isShared: response.data.isShared,
            }),
          }));
        } catch (error) {
          // Rollback on error
          set((state) => ({
            postInteractions: new Map(state.postInteractions).set(postId, currentInteraction),
          }));

          setError(`share-${postId}`, {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to toggle share',
          });
        } finally {
          setLoading(`share-${postId}`, false);
        }
      },

      // Favorite actions
      toggleFavorite: async (profileId: string) => {
        const { favoritedProfiles, setLoading, setError } = get();
        const wasFavorited = favoritedProfiles.has(profileId);

        // Optimistic update
        const newFavorites = new Set(favoritedProfiles);
        if (wasFavorited) {
          newFavorites.delete(profileId);
        } else {
          newFavorites.add(profileId);
        }

        set({ favoritedProfiles: newFavorites });
        setLoading(`favorite-${profileId}`, true);

        try {
          const method = wasFavorited ? 'DELETE' : 'POST';
          await apiCall(`/api/profiles/${profileId}/favorite`, { method });
        } catch (error) {
          // Rollback on error
          set({ favoritedProfiles });

          setError(`favorite-${profileId}`, {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to toggle favorite',
          });
        } finally {
          setLoading(`favorite-${profileId}`, false);
        }
      },

      loadFavorites: async () => {
        const { setLoading, setError } = get();

        setLoading('favorites', true);

        try {
          const response = await apiCall<{ data: { profiles: FavoriteProfile[] } }>(
            '/api/profiles/favorites'
          );

          const favoriteIds = new Set(response.data.profiles.map((p) => p.id));
          set({ favoritedProfiles: favoriteIds });

          return response.data.profiles;
        } catch (error) {
          setError('favorites', {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to load favorites',
          });
          return [];
        } finally {
          setLoading('favorites', false);
        }
      },

      // Utility actions
      clearError: (id: string) => {
        set((state) => {
          const newErrors = new Map(state.errors);
          newErrors.delete(id);
          return { errors: newErrors };
        });
      },

      resetStore: () => {
        set({
          postInteractions: new Map(),
          commentInteractions: new Map(),
          favoritedProfiles: new Set(),
          pendingInteractions: new Map(),
          loadingStates: new Map(),
          errors: new Map(),
        });
      },

      getPostInteraction: (postId: string) => {
        return get().postInteractions.get(postId) || null;
      },

      getCommentInteraction: (commentId: string) => {
        return get().commentInteractions.get(commentId) || null;
      },

      isFavorited: (profileId: string) => {
        return get().favoritedProfiles.has(profileId);
      },

      setLoading: (id: string, loading: boolean) => {
        set((state) => {
          const newLoadingStates = new Map(state.loadingStates);
          if (loading) {
            newLoadingStates.set(id, true);
          } else {
            newLoadingStates.delete(id);
          }
          return { loadingStates: newLoadingStates };
        });
      },

      setError: (id: string, error: InteractionError) => {
        set((state) => ({
          errors: new Map(state.errors).set(id, error),
        }));
      },
    }),
    {
      name: 'babylon-interactions',
      // Custom serialization for Maps and Sets
      partialize: (state) => ({
        postInteractions: Array.from(state.postInteractions.entries()),
        commentInteractions: Array.from(state.commentInteractions.entries()),
        favoritedProfiles: Array.from(state.favoritedProfiles),
      }),
      // Custom deserialization to convert arrays back to Maps and Sets
      merge: (persistedState: {
        postInteractions?: Array<[string, PostInteraction]>;
        commentInteractions?: Array<[string, CommentInteraction]>;
        favoritedProfiles?: string[];
      } | null | undefined, currentState: InteractionStore) => {
        const persisted = persistedState || {
          postInteractions: undefined,
          commentInteractions: undefined,
          favoritedProfiles: undefined,
        };

        return {
          ...currentState,
          postInteractions: new Map(persisted?.postInteractions || []),
          commentInteractions: new Map(persisted?.commentInteractions || []),
          favoritedProfiles: new Set(persisted?.favoritedProfiles || []),
        };
      },
    }
  )
);
