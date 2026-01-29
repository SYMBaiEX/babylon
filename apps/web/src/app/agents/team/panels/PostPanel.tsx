'use client';

import type { PostTagData } from '@babylon/shared';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';

interface PostPanelProps {
  data: PostTagData;
}

export function PostPanel({ data }: PostPanelProps) {
  const { post, comments, commentCount } = data;

  return (
    <div className="space-y-4 p-4">
      {/* Post */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <Link
            href={`/profile/${post.authorId}`}
            className="font-medium text-sm transition-colors hover:text-primary"
          >
            @{post.author}
          </Link>
          <span className="text-muted-foreground text-xs">
            {new Date(post.createdAt).toLocaleDateString()}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm">{post.content}</p>
        <div className="mt-3 flex items-center gap-1 text-muted-foreground text-xs">
          <MessageCircle className="h-3.5 w-3.5" />
          <span>{commentCount} comments</span>
        </div>
      </div>

      {/* Comments */}
      {comments && comments.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Comments</h4>
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs">
                  @{comment.authorName}
                </span>
                <span className="text-muted-foreground text-xs">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1 text-sm">{comment.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Link to full post */}
      <Link
        href={`/post/${post.id}`}
        className="block rounded-lg border border-border p-3 text-center text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
      >
        View full post →
      </Link>
    </div>
  );
}
