import { PrismaClient } from '@prisma/client'
import actorsData from '../data/actors.json'

const prisma = new PrismaClient()

interface Actor {
  id: string
  name: string
  realName?: string
  username: string
  description: string
  domain?: string[]
  personality: string
  postStyle: string
  postExample: string[]
  profileImageUrl?: string
}

async function main() {
  console.log('🌱 Starting database seed...')

  // Clear existing data
  console.log('🗑️  Clearing existing data...')
  await prisma.message.deleteMany()
  await prisma.chatParticipant.deleteMany()
  await prisma.chat.deleteMany()
  await prisma.position.deleteMany()
  await prisma.market.deleteMany()
  await prisma.follow.deleteMany()
  await prisma.reaction.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.post.deleteMany()
  await prisma.user.deleteMany()
  await prisma.game.deleteMany()

  // Seed actors from actors.json
  console.log(`👥 Seeding ${actorsData.actors.length} actors...`)

  const actors = actorsData.actors as Actor[]

  for (const actor of actors) {
    await prisma.user.upsert({
      where: { username: actor.username },
      update: {
        displayName: actor.name,
        bio: actor.description,
        profileImageUrl: actor.profileImageUrl || null,
        personality: actor.personality,
        postStyle: actor.postStyle,
        postExample: actor.postExample.join('\n---\n'),
      },
      create: {
        id: actor.id,
        username: actor.username,
        displayName: actor.name,
        bio: actor.description,
        profileImageUrl: actor.profileImageUrl || null,
        isActor: true,
        personality: actor.personality,
        postStyle: actor.postStyle,
        postExample: actor.postExample.join('\n---\n'),
        walletAddress: null, // Actors don't have wallet addresses
      },
    })
  }

  console.log(`✅ Seeded ${actors.length} actors`)

  // Create initial game state
  console.log('🎮 Creating initial game state...')
  await prisma.game.create({
    data: {
      id: 'default-game',
      currentDay: 1,
      isRunning: false,
      speed: Number(process.env.GAME_SPEED_DEFAULT) || 5000,
    },
  })

  console.log('✅ Database seeded successfully!')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
