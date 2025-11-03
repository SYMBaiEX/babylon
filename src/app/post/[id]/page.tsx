'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { PostCard } from '@/components/posts/PostCard';
import { FeedCommentSection } from '@/components/feed/FeedCommentSection';
import { WidgetSidebar } from '@/components/shared/WidgetSidebar';
import { PageContainer } from '@/components/shared/PageContainer';
import { useInteractionStore } from '@/stores/interactionStore';
import { logger } from '@/lib/logger';

interface PostPageProps {
  params: Promise<{ id: string }>;
}

export default function PostPage({ params }: PostPageProps) {
  const { id: postId } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<{
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    authorUsername?: string | null;
    timestamp: string;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    isLiked: boolean;
    isShared: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPost = async () => {
      if (!postId) {
        setError('Post ID is required');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        logger.debug('Loading post:', { postId }, 'PostPage');
        const response = await fetch(`/api/posts/${postId}`);
        
        if (!response.ok) {
          let errorMessage = 'Failed to load post';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
            logger.error('API error response:', { status: response.status, errorData }, 'PostPage');
          } catch {
            // If JSON parsing fails, use status-based message
            if (response.status === 404) {
              errorMessage = 'Post not found';
            } else if (response.status === 500) {
              errorMessage = 'Server error. Please try again later.';
            }
            logger.error('API error (no JSON):', { status: response.status }, 'PostPage');
          }
          setError(errorMessage);
          setIsLoading(false);
          return;
        }

        const result = await response.json();
        logger.debug('API response received:', { hasData: !!result.data, keys: Object.keys(result) }, 'PostPage');
        
        // successResponse wraps data in a data property: { data: {...} }
        // But successResponse does NextResponse.json(data), so if we pass { data: {...} }
        // it returns { data: {...} }
        const postData = result.data || result;
        
        if (!postData || !postData.id) {
          logger.error('Invalid post data:', { result, postData }, 'PostPage');
          setError('Invalid post data received');
          setIsLoading(false);
          return;
        }
        
        logger.debug('Post data parsed:', { 
          id: postData.id, 
          hasContent: !!postData.content,
          authorName: postData.authorName 
        }, 'PostPage');

        // Get interaction data from store
        const { postInteractions } = useInteractionStore.getState();
        const storeData = postInteractions.get(postId);

        setPost({
          id: postData.id,
          content: postData.content || '[No content]',
          authorId: postData.authorId,
          authorName: postData.authorName || postData.authorId || 'Unknown',
          authorUsername: postData.authorUsername || null,
          timestamp: postData.timestamp || postData.createdAt || new Date().toISOString(),
          likeCount: storeData?.likeCount ?? postData.likeCount ?? 0,
          commentCount: storeData?.commentCount ?? postData.commentCount ?? 0,
          shareCount: storeData?.shareCount ?? postData.shareCount ?? 0,
          isLiked: storeData?.isLiked ?? postData.isLiked ?? false,
          isShared: storeData?.isShared ?? postData.isShared ?? false,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load post';
        logger.error('Error loading post:', err, 'PostPage');
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadPost();
  }, [postId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Post Not Found</h1>
          <p className="text-muted-foreground mb-4">{error || 'The post you are looking for does not exist.'}</p>
          <button
            onClick={() => router.push('/feed')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Back to Feed
          </button>
        </div>
      </div>
    );
  }

  return (
    <PageContainer>
      {/* Desktop: Multi-column layout */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Left: Post content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Desktop: Top bar with back button */}
          <div className="sticky top-0 z-10 bg-background shadow-sm flex-shrink-0 border-b border-border">
            <div className="px-6 py-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-[#1c9cf0]" />
                  <h1 className="font-semibold text-lg">Post</h1>
                </div>
              </div>
            </div>
          </div>

          {/* Post content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto w-full">
              {/* Post */}
              <div className="border-b border-border">
                <PostCard
                  post={post}
                  showInteractions={true}
                  isDetail
                />
              </div>

              {/* Comments Section */}
              <FeedCommentSection
                postId={postId}
                postData={post}
                onClose={undefined}
              />
            </div>
          </div>
        </div>

        {/* Right: Widget sidebar */}
        <WidgetSidebar />
      </div>

      {/* Mobile/Tablet: Single column layout */}
      <div className="lg:hidden flex flex-col flex-1 overflow-hidden">
        {/* Mobile header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border flex-shrink-0">
          <div className="flex items-center gap-4 px-4 py-3">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#1c9cf0]" />
              <h1 className="font-semibold text-lg">Post</h1>
            </div>
          </div>
        </div>

        {/* Mobile content */}
        <div className="flex-1 overflow-y-auto">
          {/* Post */}
          <div className="border-b border-border">
            <PostCard
              post={post}
              showInteractions={true}
              isDetail
            />
          </div>

          {/* Comments Section */}
          <FeedCommentSection
            postId={postId}
            postData={post}
            onClose={undefined}
          />
        </div>
      </div>
    </PageContainer>
  );
}
