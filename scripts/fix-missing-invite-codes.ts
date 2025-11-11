/**
 * Fix Missing Invite Codes
 * 
 * This script finds all waitlisted users without invite codes
 * and generates unique codes for them.
 */

import { PrismaClient } from '@prisma/client'
import { WaitlistService } from '@/lib/services/waitlist-service'

const prisma = new PrismaClient()

async function fixMissingInviteCodes() {
  try {
    console.log('🔧 Fixing missing invite codes...\n')

    // Find all waitlisted users without invite codes
    const usersWithoutCodes = await prisma.user.findMany({
      where: {
        isWaitlistActive: true,
        referralCode: null
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true
      }
    })

    if (usersWithoutCodes.length === 0) {
      console.log('✅ All waitlisted users already have invite codes!')
      return
    }

    console.log(`Found ${usersWithoutCodes.length} users without invite codes:\n`)

    for (const user of usersWithoutCodes) {
      const displayName = user.displayName || user.username || user.email || user.id
      console.log(`Processing: ${displayName}`)

      // Generate a unique invite code
      let code = WaitlistService.generateInviteCode()
      let attempts = 0
      const maxAttempts = 10

      // Ensure code is unique
      while (attempts < maxAttempts) {
        const existing = await prisma.user.findUnique({
          where: { referralCode: code }
        })

        if (!existing) break

        code = WaitlistService.generateInviteCode()
        attempts++
      }

      if (attempts >= maxAttempts) {
        console.log(`  ❌ Failed to generate unique code after ${maxAttempts} attempts`)
        continue
      }

      // Save the code
      await prisma.user.update({
        where: { id: user.id },
        data: { referralCode: code }
      })

      console.log(`  ✓ Generated code: ${code}`)
    }

    console.log(`\n✅ Fixed ${usersWithoutCodes.length} users!`)

  } catch (error) {
    console.error('❌ Error fixing invite codes:', error)
  } finally {
    await prisma.$disconnect()
  }
}

fixMissingInviteCodes()

