import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('ids')
  
  if (!idsParam) {
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
}

