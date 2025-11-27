#!/usr/bin/env bun
/**
 * Admin Management Tool
 *
 * Admin management script for all admin operations:
 * - Check admin status
 * - Grant/revoke admin privileges
 * - List all admins
 *
 * Usage:
 *   bun run scripts/admin.ts check <username>
 *   bun run scripts/admin.ts grant <username>
 *   bun run scripts/admin.ts revoke <username>
 *   bun run scripts/admin.ts list
 */

import { asc, closeDatabase, db, eq, or, sql, users } from '@babylon/db';

const command = process.argv[2];
const identifier = process.argv[3];

async function checkAdmin(identifier: string) {
  const result = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.id, identifier)))
    .limit(1);

  if (result.length === 0) {
    console.error(`❌ User not found: ${identifier}`);

    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .where(eq(users.isActor, false))
      .orderBy(sql`${users.createdAt} DESC`)
      .limit(10);

    console.log('\nRecent users:', allUsers);
    process.exit(1);
  }

  const userData = result[0]!;

  console.log('\n✅ User found:');
  console.log('   ID:', userData.id);
  console.log('   Username:', userData.username);
  console.log('   Display Name:', userData.displayName);
  console.log('   Is Admin:', userData.isAdmin);

  if (!userData.isAdmin) {
    console.log('\n❌ User is NOT an admin');
    console.log('\nTo fix this, run:');
    console.log(`   bun run scripts/admin.ts grant ${identifier}`);
  } else {
    console.log('\n✅ User IS an admin');
  }
}

async function grantAdmin(identifier: string) {
  const result = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
      isActor: users.isActor,
    })
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.id, identifier)))
    .limit(1);

  if (result.length === 0) {
    console.error(`❌ User not found: ${identifier}`);
    process.exit(1);
  }

  const user = result[0]!;

  if (user.isActor) {
    console.error('❌ Cannot promote actors/NPCs to admin');
    process.exit(1);
  }

  if (user.isAdmin) {
    console.log(
      `✅ User ${user.username} (${user.displayName}) is already an admin`
    );
    process.exit(0);
  }

  await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));

  console.log(
    `✅ Successfully made ${user.username} (${user.displayName}) an admin`
  );
  console.log(`   User ID: ${user.id}`);

  const verification = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, user.id));
  console.log(`   Verified isAdmin: ${verification[0]?.isAdmin}`);
}

async function revokeAdmin(identifier: string) {
  const result = await db
    .select({
      id: users.id,
      username: users.username,
      walletAddress: users.walletAddress,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(
      or(
        eq(users.walletAddress, identifier),
        eq(users.username, identifier),
        eq(users.id, identifier)
      )
    )
    .limit(1);

  if (result.length === 0) {
    console.error(`❌ User not found: ${identifier}`);
    process.exit(1);
  }

  const user = result[0]!;

  if (!user.isAdmin) {
    console.log(
      `ℹ️  User ${user.username || user.walletAddress || user.id} is not an admin`
    );
    process.exit(0);
  }

  await db.update(users).set({ isAdmin: false }).where(eq(users.id, user.id));

  console.log(
    `✅ Admin privileges revoked from ${user.username || user.walletAddress || user.id}`
  );
}

async function listAdmins() {
  const admins = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      walletAddress: users.walletAddress,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.isAdmin, true))
    .orderBy(asc(users.createdAt));

  if (admins.length === 0) {
    console.log('ℹ️  No admin users found');
    process.exit(0);
  }

  console.log(`\n📋 Admin Users (${admins.length}):\n`);
  console.log('─'.repeat(80));

  for (const admin of admins) {
    console.log(`\nUsername:     ${admin.username || 'N/A'}`);
    console.log(`Display Name: ${admin.displayName || 'N/A'}`);
    console.log(`Wallet:       ${admin.walletAddress || 'N/A'}`);
    console.log(`User ID:      ${admin.id}`);
    console.log(`Joined:       ${admin.createdAt.toISOString()}`);
    console.log('─'.repeat(80));
  }
}

function showHelp() {
  console.log('Babylon Admin Management Tool');
  console.log('\nUsage:');
  console.log('  bun run scripts/admin.ts check <username>');
  console.log('  bun run scripts/admin.ts grant <username>');
  console.log('  bun run scripts/admin.ts revoke <username>');
  console.log('  bun run scripts/admin.ts list');
  console.log('\nExamples:');
  console.log('  bun run scripts/admin.ts check alice');
  console.log('  bun run scripts/admin.ts grant alice');
  console.log('  bun run scripts/admin.ts grant 0x1234...5678');
  console.log('  bun run scripts/admin.ts list');
}

async function main() {
  try {
    switch (command) {
      case 'check':
        if (!identifier) {
          console.error('❌ Please provide a username or user ID');
          showHelp();
          process.exit(1);
        }
        await checkAdmin(identifier);
        break;

      case 'grant':
        if (!identifier) {
          console.error(
            '❌ Please provide a username, wallet address, or user ID'
          );
          showHelp();
          process.exit(1);
        }
        await grantAdmin(identifier);
        break;

      case 'revoke':
        if (!identifier) {
          console.error(
            '❌ Please provide a username, wallet address, or user ID'
          );
          showHelp();
          process.exit(1);
        }
        await revokeAdmin(identifier);
        break;

      case 'list':
        await listAdmins();
        break;

      default:
        showHelp();
        process.exit(1);
    }
  } finally {
    await closeDatabase();
  }
}

main();
