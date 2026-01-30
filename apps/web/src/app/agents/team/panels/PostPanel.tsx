'use client';

import type { PostTagData } from '@babylon/shared';
import { cn } from '@babylon/shared';
import { ExternalLink, MessageCircle, Reply } from 'lucide-react';
import Link from 'next/link';

interface PostPanelProps {
  data: PostTagData;
}

/** Generate a consistent color based on a string (author name) */
function getAvatarColor(name: string): string {
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-green-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-sky-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-purple-500',
    'bg-fuchsia-500',
    'bg-pink-500',
    'bg-rose-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length] ?? 'bg-primary';
}

/** Get initial(s) from author name */
function getInitials(name: string): string {
  const parts = name.split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
  }
  return (name.slice(0, 2) || '??').toUpperCase();
}

/** Format date to relative or absolute */
function formatDate(date: Date): string {
  const now = Date.now();
  const diffMs = now - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}

export function PostPanel({ data }: PostPanelProps) {
  const { post, comments, commentCount } = data;

  return (
    <div className="space-y-4 p-4">
      {/* Post */}
      <div className="rounded-lg border border-border bg-card p-4">
        {/* Author Row */}
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <Link
            href={`/profile/${post.authorId}`}
            className="shrink-0 transition-opacity hover:opacity-80"
          >
            {post.authorProfileImageUrl ? (
              <img
                src={post.authorProfileImageUrl}
                alt={post.author}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full font-medium text-sm text-white',
                  getAvatarColor(post.author)
                )}
              >
                {getInitials(post.author)}
              </div>
            )}
          </Link>

          {/* Author Info */}
          <div className="min-w-0 flex-1">
            <Link
              href={`/profile/${post.authorId}`}
              className="block truncate font-medium text-sm transition-colors hover:text-primary"
            >
              @{post.author}
            </Link>
            <span className="text-muted-foreground text-xs">
              {formatDate(post.createdAt)}
            </span>
          </div>
        </div>

        {/* Content */}
        <p className="mt-3 whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
          {post.content}
        </p>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-1 text-muted-foreground text-xs">
          <MessageCircle className="h-4 w-4" />
          <span>{commentCount} comments</span>
        </div>
      </div>

      {/* Comments Section */}
      {comments && comments.length > 0 && (
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 font-medium text-sm">
            <MessageCircle className="h-4 w-4" />
            Comments ({comments.length})
          </h4>

          <div className="space-y-2">
            {comments.map((comment) => {
              const isReply = comment.parentCommentId !== null;

              return (
                <div
                  key={comment.id}
                  className={cn(
                    'rounded-lg border border-border bg-muted/30 p-3',
                    isReply && 'ml-4 border-l-2 border-l-primary/30'
                  )}
                >
                  {/* Reply indicator */}
                  {isReply && (
                    <div className="mb-1.5 flex items-center gap-1 text-muted-foreground text-xs">
                      <Reply className="h-3 w-3" />
                      <span>Reply</span>
                    </div>
                  )}

                  {/* Comment Author Row */}
                  <div className="flex items-center gap-2">
                    {/* Small Avatar */}
                    {comment.authorProfileImageUrl ? (
                      <img
                        src={comment.authorProfileImageUrl}
                        alt={comment.authorName}
                        className="h-6 w-6 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-medium text-[10px] text-white',
                          getAvatarColor(comment.authorName)
                        )}
                      >
                        {getInitials(comment.authorName)}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs">
                        @{comment.authorName}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        · {formatDate(comment.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Comment Content */}
                  <p className="mt-1.5 text-foreground/90 text-sm leading-relaxed">
                    {comment.content}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty Comments State */}
      {(!comments || comments.length === 0) && (
        <div className="rounded-lg border border-border border-dashed p-4 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-muted-foreground text-sm">No comments yet</p>
        </div>
      )}

      {/* Link to full post */}
      <Link
        href={`/post/${post.id}`}
        className="flex items-center justify-center gap-2 rounded-lg border border-border p-3 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
      >
        <ExternalLink size={14} />
        View full post →
      </Link>
    </div>
  );
}
