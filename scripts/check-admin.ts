/**
 * Check admin status
 * 
 * Usage:
 *   bun run scripts/check-admin.ts <username>
 */

import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  const username = process.argv[2] || 'blockchain_b0ss'

  try {
    // Find user - bypass any RLS
    const user = await prisma.$queryRaw<Array<{
      id: string;
      username: string;
      displayName: string | null;
      isAdmin: boolean;
    }>>`
      SELECT id, username, "displayName", "isAdmin" 
      FROM "User" 
      WHERE username = ${username} OR id = ${username}
      LIMIT 1
    `

    console.log('Raw query result:', user)

    if (!user || (Array.isArray(user) && user.length === 0)) {
      console.error(`❌ User not found: ${username}`)
      
      // Show all users
      const allUsers = await prisma.$queryRaw<Array<{
        id: string;
        username: string;
        displayName: string | null;
        isAdmin: boolean;
      }>>`
        SELECT id, username, "displayName", "isAdmin" 
        FROM "User" 
        WHERE "isActor" = false
        ORDER BY "createdAt" DESC
        LIMIT 10
      `
      console.log('\nRecent users:', allUsers)
      process.exit(1)
    }

    const userData = Array.isArray(user) ? user[0] : user
    console.log('\n✅ User found:')
    console.log('   ID:', userData.id)
    console.log('   Username:', userData.username)
    console.log('   Display Name:', userData.displayName)
    console.log('   Is Admin:', userData.isAdmin)
    
    if (!userData.isAdmin) {
      console.log('\n❌ User is NOT an admin')
      console.log('\nTo fix this, run:')
      console.log(`   bun run scripts/make-admin.ts ${username}`)
      console.log('\nOr run this SQL directly:')
      console.log(`   UPDATE "User" SET "isAdmin" = true WHERE id = '${userData.id}';`)
    } else {
      console.log('\n✅ User IS an admin')
    }
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

checkAdmin()

