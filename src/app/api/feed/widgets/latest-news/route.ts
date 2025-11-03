import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

interface ArticleItem {
  id: string
  title: string
  summary: string
  authorOrgName: string
  byline?: string
  sentiment?: string
  category?: string
  publishedAt: string
  relatedQuestion?: number
  slant?: string
  biasScore?: number
}

export async function GET(_request: NextRequest) {
  try {
    // Get recent articles (last 24 hours, or fallback to any recent if none)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    let articles = await prisma.article.findMany({
      where: {
        publishedAt: { gte: oneDayAgo },
      },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    });

    // If no articles in last 24 hours, get most recent articles
    if (articles.length === 0) {
      articles = await prisma.article.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 5,
      });
    }

    // Format articles for frontend
    const articleItems: ArticleItem[] = articles.map(article => ({
      id: article.id,
      title: article.title,
      summary: article.summary,
      authorOrgName: article.authorOrgName,
      byline: article.byline || undefined,
      sentiment: article.sentiment || undefined,
      category: article.category || undefined,
      publishedAt: article.publishedAt.toISOString(),
      relatedQuestion: article.relatedQuestion || undefined,
      slant: article.slant || undefined,
      biasScore: article.biasScore || undefined,
    }));

    return NextResponse.json({
      success: true,
      articles: articleItems,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error fetching latest news:', { error: errorMessage }, 'GET /api/feed/widgets/latest-news')
    return NextResponse.json(
      { success: false, error: 'Failed to fetch latest news' },
      { status: 500 }
    )
  }
}

