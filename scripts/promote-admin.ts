/**
 * Admin Bootstrap Script
 * 
 * Promotes a user to admin status directly via database
 * Use this to create the first admin or recover admin access
 * 
 * Usage:
 *   npx tsx scripts/promote-admin.ts <username>
 *   npx tsx scripts/promote-admin.ts --wallet <wallet-address>
 *   npx tsx scripts/promote-admin.ts --id <user-id>
 */

import { prisma } from '@/lib/database-service';

async function promoteAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Error: Please provide a user identifier');
    console.log('\nUsage:');
    console.log('  npx tsx scripts/promote-admin.ts <username>');
    console.log('  npx tsx scripts/promote-admin.ts --wallet <wallet-address>');
    console.log('  npx tsx scripts/promote-admin.ts --id <user-id>');
    console.log('\nExamples:');
    console.log('  npx tsx scripts/promote-admin.ts alice');
    console.log('  npx tsx scripts/promote-admin.ts --wallet 0x1234...');
    console.log('  npx tsx scripts/promote-admin.ts --id user-123');
    process.exit(1);
  }

  let whereClause: { username?: string; walletAddress?: string; id?: string } = {};
  let searchType = 'username';
  let searchValue = args[0];

  if (args[0] === '--wallet') {
    if (!args[1]) {
      console.error('❌ Error: Wallet address is required');
      process.exit(1);
    }
    whereClause.walletAddress = args[1];
    searchType = 'wallet';
    searchValue = args[1];
  } else if (args[0] === '--id') {
    if (!args[1]) {
      console.error('❌ Error: User ID is required');
      process.exit(1);
    }
    whereClause.id = args[1];
    searchType = 'id';
    searchValue = args[1];
  } else {
    whereClause.username = args[0];
    searchType = 'username';
    searchValue = args[0];
  }

  console.log(`\n🔍 Searching for user by ${searchType}: ${searchValue}\n`);

  try {
    // Find the user
    const user = await prisma.user.findFirst({
      where: whereClause,
      select: {
        id: true,
        username: true,
        displayName: true,
        walletAddress: true,
        isAdmin: true,
        isActor: true,
        isBanned: true,
      },
    });

    if (!user) {
      console.error(`❌ User not found with ${searchType}: ${searchValue}`);
      process.exit(1);
    }

    console.log('✅ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username || 'N/A'}`);
    console.log(`   Display Name: ${user.displayName || 'N/A'}`);
    console.log(`   Wallet: ${user.walletAddress || 'N/A'}`);
    console.log(`   Is Admin: ${user.isAdmin ? 'Yes ✓' : 'No'}`);
    console.log(`   Is Actor: ${user.isActor ? 'Yes' : 'No'}`);
    console.log(`   Is Banned: ${user.isBanned ? 'Yes' : 'No'}`);
    console.log('');

    // Check if user is an actor
    if (user.isActor) {
      console.error('❌ Cannot promote actors/NPCs to admin');
      process.exit(1);
    }

    // Check if user is banned
    if (user.isBanned) {
      console.error('❌ Cannot promote banned users to admin');
      process.exit(1);
    }

    // Check if already admin
    if (user.isAdmin) {
      console.log('ℹ️  User is already an admin');
      process.exit(0);
    }

    // Confirm promotion
    console.log('⚠️  You are about to grant admin privileges to this user.');
    console.log('   This will give them full access to:');
    console.log('   - User management (ban/unban)');
    console.log('   - Admin management (promote/demote admins)');
    console.log('   - System statistics and monitoring');
    console.log('   - All administrative functions');
    console.log('');

    // In a real scenario, you might want to add a confirmation prompt
    // For now, we'll just proceed
    console.log('🔄 Promoting user to admin...\n');

    // Promote user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isAdmin: true,
        updatedAt: new Date(),
      },
    });

    console.log('✅ Success! User has been promoted to admin.');
    console.log('');
    console.log('Next steps:');
    console.log('1. User can now access the admin panel at /admin');
    console.log('2. User can manage other admins in the Admins tab');
    console.log('3. Consider adding additional admins for redundancy');
    console.log('');

  } catch (error) {
    console.error('❌ Error promoting user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// List all current admins
async function listAdmins() {
  console.log('\n📋 Current Admins:\n');

  try {
    const admins = await prisma.user.findMany({
      where: {
        isAdmin: true,
        isActor: false,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        walletAddress: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (admins.length === 0) {
      console.log('   No admins found.');
      console.log('');
      console.log('   Use this script to promote the first admin:');
      console.log('   npx tsx scripts/promote-admin.ts <username>');
      console.log('');
    } else {
      admins.forEach((admin, index) => {
        console.log(`${index + 1}. ${admin.displayName || admin.username || 'Anonymous'}`);
        console.log(`   Username: ${admin.username || 'N/A'}`);
        console.log(`   Wallet: ${admin.walletAddress || 'N/A'}`);
        console.log(`   Admin since: ${admin.createdAt.toISOString().split('T')[0]}`);
        console.log('');
      });
      console.log(`Total admins: ${admins.length}`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error listing admins:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
const command = process.argv[2];
if (command === '--list' || command === '-l') {
  listAdmins();
} else {
  promoteAdmin();
}


