#!/usr/bin/env bun

/**
 * Admin Management Commands
 *
 * Commands:
 *   check <user>  - Check if user is admin
 *   grant <user>  - Grant admin privileges
 *   revoke <user> - Revoke admin privileges
 *   list          - List all admin users
 */

import { asc, db, eq, or, sql, users, closeDatabase } from '@babylon/db';
import { parseArgs, wantsHelp } from '../lib/args.js';
import { logger } from '../lib/logger.js';

function printHelp(): void {
  console.log(`
Admin Management

USAGE:
  babylon admin <command> [identifier]

COMMANDS:
  check <user>   Check admin status of a user
  grant <user>   Grant admin privileges to a user
  revoke <user>  Revoke admin privileges from a user
  list           List all admin users

IDENTIFIER:
  Can be username, wallet address, or user ID

EXAMPLES:
  babylon admin check alice
  babylon admin grant alice
  babylon admin grant 0x1234...5678
  babylon admin revoke bob
  babylon admin list
`);
}

async function checkAdmin(identifier: string): Promise<void> {
  logger.header('Check Admin Status');

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
    logger.fail(`User not found: ${identifier}`);

    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.isActor, false))
      .orderBy(sql`${users.createdAt} DESC`)
      .limit(10);

    console.log('\nRecent users:');
    for (const user of allUsers) {
      console.log(`  ${user.username || user.id} (${user.displayName || 'N/A'})`);
    }
    process.exit(1);
  }

  const userData = result[0]!;

  console.log('User found:');
  console.log(`  ID:           ${userData.id}`);
  console.log(`  Username:     ${userData.username || 'N/A'}`);
  console.log(`  Display Name: ${userData.displayName || 'N/A'}`);
  console.log(`  Is Admin:     ${userData.isAdmin ? '✅ Yes' : '❌ No'}`);

  if (!userData.isAdmin) {
    console.log('\nTo grant admin privileges:');
    console.log(`  babylon admin grant ${identifier}`);
  }
}

async function grantAdmin(identifier: string): Promise<void> {
  logger.header('Grant Admin Privileges');

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
    logger.fail(`User not found: ${identifier}`);
    process.exit(1);
  }

  const user = result[0]!;

  if (user.isActor) {
    logger.fail('Cannot promote actors/NPCs to admin');
    process.exit(1);
  }

  if (user.isAdmin) {
    logger.success(`${user.username || user.id} is already an admin`);
    return;
  }

  await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));

  logger.success(`Granted admin privileges to ${user.username || user.displayName || user.id}`);
  console.log(`  User ID: ${user.id}`);

  // Verify
  const verification = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, user.id));

  console.log(`  Verified: ${verification[0]?.isAdmin ? '✅' : '❌'}`);
}

async function revokeAdmin(identifier: string): Promise<void> {
  logger.header('Revoke Admin Privileges');

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
    logger.fail(`User not found: ${identifier}`);
    process.exit(1);
  }

  const user = result[0]!;

  if (!user.isAdmin) {
    console.log(`${user.username || user.walletAddress || user.id} is not an admin`);
    return;
  }

  await db.update(users).set({ isAdmin: false }).where(eq(users.id, user.id));

  logger.success(`Revoked admin privileges from ${user.username || user.walletAddress || user.id}`);
}

async function listAdmins(): Promise<void> {
  logger.header('Admin Users');

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
    console.log('No admin users found');
    return;
  }

  console.log(`Found ${admins.length} admin(s):\n`);

  for (const admin of admins) {
    console.log(`${'─'.repeat(50)}`);
    console.log(`Username:     ${admin.username || 'N/A'}`);
    console.log(`Display Name: ${admin.displayName || 'N/A'}`);
    console.log(`Wallet:       ${admin.walletAddress || 'N/A'}`);
    console.log(`User ID:      ${admin.id}`);
    console.log(`Joined:       ${admin.createdAt.toISOString()}`);
  }
  console.log(`${'─'.repeat(50)}`);
}

export async function runAdminCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (wantsHelp(parsed)) {
    printHelp();
    process.exit(0);
  }

  try {
    switch (parsed.command) {
      case 'check':
        if (!parsed.positional[0]) {
          logger.fail('Please provide a username or user ID');
          printHelp();
          process.exit(1);
        }
        await checkAdmin(parsed.positional[0]);
        break;

      case 'grant':
        if (!parsed.positional[0]) {
          logger.fail('Please provide a username, wallet address, or user ID');
          printHelp();
          process.exit(1);
        }
        await grantAdmin(parsed.positional[0]);
        break;

      case 'revoke':
        if (!parsed.positional[0]) {
          logger.fail('Please provide a username, wallet address, or user ID');
          printHelp();
          process.exit(1);
        }
        await revokeAdmin(parsed.positional[0]);
        break;

      case 'list':
        await listAdmins();
        break;

      default:
        if (parsed.command) {
          logger.fail(`Unknown command: ${parsed.command}`);
        }
        printHelp();
        process.exit(parsed.command ? 1 : 0);
    }
  } finally {
    await closeDatabase();
  }
}

