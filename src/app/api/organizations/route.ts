import type { NextRequest } from 'next/server';
import { optionalAuth } from '@/lib/api/auth-middleware'
import { asUser, asPublic } from '@/lib/db/context'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('ids')
  
  // Optional auth - organizations are public but RLS still applies
  const authUser = await optionalAuth(request as NextRequest).catch(() => null)
  
  const organizations = (authUser && authUser.userId)
    ? await asUser(authUser, async (db) => {
        if (!idsParam) {
          return await db.organization.findMany({
            select: {
              id: true,
              name: true,
              type: true,
              description: true,
            },
            take: 100,
          })
        }
        
        const ids = idsParam.split(',').filter(Boolean)
        
        return await db.organization.findMany({
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
      })
    : await asPublic(async (db) => {
        if (!idsParam) {
          return await db.organization.findMany({
            select: {
              id: true,
              name: true,
              type: true,
              description: true,
            },
            take: 100,
          })
        }
        
        const ids = idsParam.split(',').filter(Boolean)
        
        return await db.organization.findMany({
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
      })
  
  return NextResponse.json({
    success: true,
    organizations,
  })
}

