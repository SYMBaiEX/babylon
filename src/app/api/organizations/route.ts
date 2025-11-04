import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const idsParam = searchParams.get('ids')
    
    if (!idsParam) {
      // Return all organizations if no IDs specified
      const organizations = await prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
        },
        take: 100,
      })
      
      return NextResponse.json({
        success: true,
        organizations,
      })
    }
    
    // Parse comma-separated IDs
    const ids = idsParam.split(',').filter(Boolean)
    
    const organizations = await prisma.organization.findMany({
      where: {
        id: { in: ids },
      },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
      },
    })
    
    return NextResponse.json({
      success: true,
      organizations,
    })
  } catch (error) {
    logger.error('Error fetching organizations:', error, 'GET /api/organizations')
    return NextResponse.json(
      { success: false, error: 'Failed to fetch organizations' },
      { status: 500 }
    )
  }
}

