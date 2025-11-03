#!/usr/bin/env tsx

/**
 * Check Group Chats Diagnostic Script
 * 
 * This script checks if group chats exist in the database and shows their details.
 * Run with: npx tsx scripts/check-group-chats.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('\n🔍 Checking group chats in database...\n')

  // Get all group chats
  const groupChats = await prisma.chat.findMany({
    where: {
      isGroup: true,
    },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: {
        select: {
          messages: true,
          participants: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  if (groupChats.length === 0) {
    console.log('❌ No group chats found in database!')
    console.log('\n💡 Possible solutions:')
    console.log('   1. Run the game engine to generate chats')
    console.log('   2. Check if the game has been initialized')
    console.log('   3. Run: npm run dev (game should auto-generate on start)')
    console.log('')
    return
  }

  console.log(`✅ Found ${groupChats.length} group chat(s)\n`)

  // Group by gameId
  const byGameId = groupChats.reduce((acc, chat) => {
    const gameId = chat.gameId || 'none'
    if (!acc[gameId]) acc[gameId] = []
    acc[gameId].push(chat)
    return acc
  }, {} as Record<string, typeof groupChats>)

  for (const [gameId, chats] of Object.entries(byGameId)) {
    console.log(`📁 Game: ${gameId} (${chats.length} chats)`)
    console.log('─'.repeat(60))
    
    for (const chat of chats) {
      console.log(`  💬 ${chat.name || 'Unnamed'}`)
      console.log(`     ID: ${chat.id}`)
      console.log(`     Messages: ${chat._count.messages}`)
      console.log(`     Participants: ${chat._count.participants}`)
      console.log(`     Created: ${chat.createdAt.toISOString()}`)
      
      if (chat.messages[0]) {
        const preview = chat.messages[0].content.slice(0, 60)
        console.log(`     Last msg: "${preview}${chat.messages[0].content.length > 60 ? '...' : ''}"`)
      }
      console.log('')
    }
  }

  // Check memberships
  const memberships = await prisma.groupChatMembership.findMany()

  console.log(`\n👥 Group Chat Memberships: ${memberships.length}`)
  if (memberships.length > 0) {
    console.log('─'.repeat(60))
    const byUser = memberships.reduce((acc, m) => {
      if (!acc[m.userId]) acc[m.userId] = []
      acc[m.userId].push(m)
      return acc
    }, {} as Record<string, typeof memberships>)

    for (const [userId, userMemberships] of Object.entries(byUser)) {
      console.log(`  User ${userId.slice(0, 8)}...: ${userMemberships.length} chat(s)`)
    }
  } else {
    console.log('\n⚠️  No memberships found! Users won\'t see chats in normal mode.')
    console.log('💡 In debug mode (localhost), all chats are shown regardless of membership.')
  }

  console.log('\n✅ Summary:')
  console.log(`   - Total group chats: ${groupChats.length}`)
  console.log(`   - With messages: ${groupChats.filter(c => c._count.messages > 0).length}`)
  console.log(`   - With participants: ${groupChats.filter(c => c._count.participants > 0).length}`)
  console.log(`   - User memberships: ${memberships.length}`)
  console.log('')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

