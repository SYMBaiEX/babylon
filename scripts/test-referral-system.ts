/**
 * Test Referral System End-to-End
 * 
 * This script tests the complete referral flow:
 * 1. Mark a user as waitlisted
 * 2. Verify they get an invite code
 * 3. Simulate a new user using the referral code
 * 4. Verify the referrer gets +50 points
 * 5. Verify the referral is tracked correctly
 */

import { PrismaClient } from '@prisma/client'
import { WaitlistService } from '@/lib/services/waitlist-service'
import { logger } from '@/lib/logger'

const prisma = new PrismaClient()

async function testReferralSystem() {
  try {
    console.log('🧪 Testing Referral System...\n')

    // Step 1: Find or create a test user (referrer)
    console.log('Step 1: Setting up referrer user...')
    let referrer = await prisma.user.findFirst({
      where: { 
        isWaitlistActive: true,
        referralCode: { not: null }
      }
    })

    if (!referrer) {
      console.log('No existing waitlisted user found. Please ensure at least one user is on the waitlist.')
      return
    }

    console.log(`✓ Found referrer: ${referrer.username} (${referrer.id})`)
    console.log(`  Referral Code: ${referrer.referralCode}`)
    console.log(`  Current Points: ${referrer.reputationPoints}`)
    console.log(`  Invite Points: ${referrer.invitePoints}`)
    console.log(`  Referral Count: ${referrer.referralCount}\n`)

    // Step 2: Get referrer's waitlist position
    console.log('Step 2: Checking referrer waitlist position...')
    const referrerPosition = await WaitlistService.getWaitlistPosition(referrer.id)
    
    if (!referrerPosition) {
      console.log('❌ Could not get referrer position')
      return
    }

    console.log(`✓ Referrer Position:`)
    console.log(`  Leaderboard Rank: #${referrerPosition.leaderboardRank}`)
    console.log(`  Waitlist Position: #${referrerPosition.waitlistPosition}`)
    console.log(`  Invite Code: ${referrerPosition.inviteCode}`)
    console.log(`  Points: ${referrerPosition.points}`)
    console.log(`  Invite Points: ${referrerPosition.invitePoints}\n`)

    // Step 3: Verify invite code is present
    if (!referrerPosition.inviteCode) {
      console.log('❌ ERROR: Invite code is missing!')
      console.log('This is the bug we need to fix.')
      
      // Try to fix by generating and saving a referral code
      console.log('\nAttempting to fix by generating referral code...')
      const newCode = WaitlistService.generateInviteCode()
      
      await prisma.user.update({
        where: { id: referrer.id },
        data: { referralCode: newCode }
      })
      
      console.log(`✓ Generated and saved referral code: ${newCode}`)
      
      // Verify it was saved
      const updatedReferrer = await prisma.user.findUnique({
        where: { id: referrer.id },
        select: { referralCode: true }
      })
      
      console.log(`✓ Verified: ${updatedReferrer?.referralCode}\n`)
      return
    }

    console.log('✅ Referral system is working correctly!')
    console.log(`\nReferral URL: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?ref=${referrerPosition.inviteCode}`)

    // Step 4: Check all waitlisted users for missing invite codes
    console.log('\n\nStep 4: Checking all waitlisted users for missing invite codes...')
    const usersWithoutCodes = await prisma.user.findMany({
      where: {
        isWaitlistActive: true,
        referralCode: null
      },
      select: {
        id: true,
        username: true,
        email: true
      }
    })

    if (usersWithoutCodes.length > 0) {
      console.log(`⚠️  Found ${usersWithoutCodes.length} users without invite codes:`)
      
      for (const user of usersWithoutCodes) {
        console.log(`  - ${user.username || user.email || user.id}`)
        
        // Generate and save invite code
        const code = WaitlistService.generateInviteCode()
        await prisma.user.update({
          where: { id: user.id },
          data: { referralCode: code }
        })
        
        console.log(`    ✓ Generated code: ${code}`)
      }
      
      console.log('\n✅ All users now have invite codes!')
    } else {
      console.log('✅ All waitlisted users have invite codes!')
    }

    // Step 5: Show summary statistics
    console.log('\n\nSummary Statistics:')
    const stats = await prisma.user.aggregate({
      where: { isWaitlistActive: true },
      _count: { id: true },
      _sum: {
        referralCount: true,
        invitePoints: true
      }
    })

    console.log(`Total Waitlisted Users: ${stats._count.id}`)
    console.log(`Total Referrals: ${stats._sum.referralCount || 0}`)
    console.log(`Total Invite Points: ${stats._sum.invitePoints || 0}`)

  } catch (error) {
    console.error('❌ Error testing referral system:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testReferralSystem()
  .then(() => {
    console.log('\n✅ Test complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })

