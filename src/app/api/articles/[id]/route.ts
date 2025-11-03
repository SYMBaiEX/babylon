import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: articleId } = await params;

    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    // Increment view count
    await prisma.article.update({
      where: { id: articleId },
      data: { viewCount: { increment: 1 } },
    });

    return NextResponse.json({
      success: true,
      article: {
        id: article.id,
        title: article.title,
        summary: article.summary,
        content: article.content,
        authorOrgId: article.authorOrgId,
        authorOrgName: article.authorOrgName,
        byline: article.byline,
        bylineActorId: article.bylineActorId,
        biasScore: article.biasScore,
        sentiment: article.sentiment,
        slant: article.slant,
        imageUrl: article.imageUrl,
        relatedEventId: article.relatedEventId,
        relatedQuestion: article.relatedQuestion,
        relatedActorIds: article.relatedActorIds,
        relatedOrgIds: article.relatedOrgIds,
        category: article.category,
        tags: article.tags,
        viewCount: article.viewCount + 1, // Return incremented count
        shareCount: article.shareCount,
        publishedAt: article.publishedAt.toISOString(),
        createdAt: article.createdAt.toISOString(),
        updatedAt: article.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error fetching article:', { error: errorMessage, articleId: params.id }, 'GET /api/articles/[id]');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch article' },
      { status: 500 }
    );
  }
}

