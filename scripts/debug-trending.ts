import { prisma } from '../src/lib/prisma'

async function debug() {
  const allTrending = await prisma.trendingTag.findMany({
    include: { tag: true },
    orderBy: { rank: 'asc' },
  })

  console.log(`Found ${allTrending.length} trending tags`)
  console.log('\nAll trending tags:')
  allTrending.forEach(t => {
    console.log(`  ${t.rank}. ${t.tag.displayName} (ID: ${t.id}, calculated: ${t.calculatedAt})`)
  })

  const latest = await prisma.trendingTag.findFirst({
    orderBy: { calculatedAt: 'desc' },
  })
  
  console.log(`\nLatest calculation: ${latest?.calculatedAt}`)

  await prisma.$disconnect()
}

debug()


