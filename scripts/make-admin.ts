/**
 * Make a user an admin
 * 
 * Usage:
 *   bun run scripts/make-admin.ts <username>
 *   bun run scripts/make-admin.ts blockchain_b0ss
 */

import { prisma } from '@/lib/prisma'

async function makeAdmin() {
  const username = process.argv[2]

  if (!username) {
    console.error('❌ Usage: bun run scripts/make-admin.ts <username>')
    process.exit(1)
  }

  try {
    // Use raw query to bypass any RLS issues
    const users = await prisma.$queryRaw`
      SELECT id, username, "displayName", "isAdmin" 
      FROM "User" 
      WHERE username = ${username} OR id = ${username}
      LIMIT 1
    ` as any[]

    if (!users || users.length === 0) {
      console.error(`❌ User not found: ${username}`)
      process.exit(1)
    }

    const user = users[0]

    if (user.isAdmin) {
      console.log(`✅ User ${user.username} (${user.displayName}) is already an admin`)
      process.exit(0)
    }

    // Make admin using raw query
    await prisma.$executeRaw`
      UPDATE "User" 
      SET "isAdmin" = true 
      WHERE id = ${user.id}
    `

    console.log(`✅ Successfully made ${user.username} (${user.displayName}) an admin`)
    console.log(`   User ID: ${user.id}`)
    
    // Verify
    const verification = await prisma.$queryRaw`
      SELECT "isAdmin" FROM "User" WHERE id = ${user.id}
    ` as any[]
    console.log(`   Verified isAdmin: ${verification[0]?.isAdmin}`)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

makeAdmin()

