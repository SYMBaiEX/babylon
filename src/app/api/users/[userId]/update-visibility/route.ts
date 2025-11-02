import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth-utils'
import prisma from '@/lib/database'
import { logger } from '@/lib/logger'

interface UpdateVisibilityRequest {
  platform: 'twitter' | 'farcaster' | 'wallet'
  visible: boolean
}

/**
 * POST /api/users/[userId]/update-visibility
 * Update social visibility preferences
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Authenticate user
    const authUser = await authenticate(request)
    const { userId } = await params

    // Verify user is updating their own preferences
    if (authUser.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Parse request body
    const body: UpdateVisibilityRequest = await request.json()
    const { platform, visible } = body

    if (!platform || visible === undefined) {
      return NextResponse.json(
        { error: 'Platform and visible fields are required' },
        { status: 400 }
      )
    }

    // Validate platform
    const validPlatforms = ['twitter', 'farcaster', 'wallet']
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json(
        { error: 'Invalid platform. Must be: twitter, farcaster, or wallet' },
        { status: 400 }
      )
    }

    // Build update data based on platform
    const updateData: Record<string, boolean> = {}
    switch (platform) {
      case 'twitter':
        updateData.showTwitterPublic = visible
        break
      case 'farcaster':
        updateData.showFarcasterPublic = visible
        break
      case 'wallet':
        updateData.showWalletPublic = visible
        break
    }

    // Update user visibility preference
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        showTwitterPublic: true,
        showFarcasterPublic: true,
        showWalletPublic: true,
      },
    })

    logger.info(
      `User ${userId} updated ${platform} visibility to ${visible}`,
      { userId, platform, visible },
      'POST /api/users/[userId]/update-visibility'
    )

    return NextResponse.json({
      success: true,
      visibility: {
        twitter: updatedUser.showTwitterPublic,
        farcaster: updatedUser.showFarcasterPublic,
        wallet: updatedUser.showWalletPublic,
      },
    })
  } catch (error) {
    logger.error('Error updating visibility:', error, 'POST /api/users/[userId]/update-visibility')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update visibility' },
      { status: 500 }
    )
  }
}

