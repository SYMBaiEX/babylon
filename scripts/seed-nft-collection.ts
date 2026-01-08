#!/usr/bin/env bun

/**
 * NFT Collection Seed Script
 *
 * Seeds placeholder NFT collection data for development and testing.
 * Creates 100 NFT entries with generated placeholder images and stories.
 *
 * Usage:
 *   bun run scripts/seed-nft-collection.ts              # Seed if empty
 *   bun run scripts/seed-nft-collection.ts --force      # Force reseed (clears existing)
 *   bun run scripts/seed-nft-collection.ts --stats      # Show collection stats
 *   bun run scripts/seed-nft-collection.ts --snapshot   # Take a leaderboard snapshot
 */

import { PointsService } from '@babylon/api';
import {
  closeDatabase,
  count,
  db,
  eq,
  nftClaims,
  nftCollection,
  nftOwnership,
  nftSnapshot,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import { nanoid } from 'nanoid';

const TOTAL_NFTS = 100;
const PLACEHOLDER_CONTRACT = '0x0000000000000000000000000000000000000000';
const PLACEHOLDER_CHAIN_ID = 1;

// Placeholder image service (generates colorful images based on seed)
const getPlaceholderImage = (tokenId: number) =>
  `https://picsum.photos/seed/babylon-nft-${tokenId}/4096/4096`;

const getPlaceholderThumbnail = (tokenId: number) =>
  `https://picsum.photos/seed/babylon-nft-${tokenId}/512/512`;

// Mythological/fantasy names for NFTs
const nftNames = [
  'The Oracle of Genesis',
  'Keeper of the Flame',
  'Shadow Walker',
  'The Last Prophet',
  'Echoes of Eternity',
  'Guardian of the Void',
  'Weaver of Dreams',
  'The Silent Watcher',
  'Bearer of Light',
  'The Eternal Wanderer',
  'Whispers in the Dark',
  'The Forgotten One',
  'Bringer of Dawn',
  'The Obsidian Crown',
  'Seeker of Truth',
  'The Crimson Tide',
  'Master of Shadows',
  'The Azure Phoenix',
  'Herald of Change',
  'The Golden Serpent',
  'Keeper of Secrets',
  'The Iron Will',
  'Dancer in Flames',
  'The Silver Moon',
  'Voice of Thunder',
  'The Jade Emperor',
  'Walker Between Worlds',
  'The Sapphire Queen',
  'Harbinger of Storms',
  'The Ruby Knight',
  'Speaker of Stars',
  'The Emerald Sage',
  'Rider of Winds',
  'The Amethyst Oracle',
  'Breaker of Chains',
  'The Topaz Hunter',
  'Singer of Souls',
  'The Pearl Maiden',
  'Caller of Ravens',
  'The Onyx Guardian',
  'Sculptor of Fate',
  'The Opal Dreamer',
  'Tamer of Beasts',
  'The Garnet Warrior',
  'Painter of Worlds',
  'The Moonstone Seer',
  'Welder of Elements',
  'The Sunstone King',
  'Keeper of Time',
  'The Bloodstone Heir',
  'Dancer of Shadows',
  'The Starstone Child',
  'Binder of Realms',
  'The Flamestone Lord',
  'Reader of Bones',
  'The Icestone Queen',
  'Shaper of Mountains',
  'The Stormstone Rider',
  'Caller of Spirits',
  'The Earthstone Titan',
  'Singer of Silence',
  'The Windstone Oracle',
  'Walker of Dreams',
  'The Voidstone Mage',
  'Keeper of Balance',
  'The Lightstone Angel',
  'Breaker of Curses',
  'The Darkstone Demon',
  'Healer of Wounds',
  'The Lifestone Druid',
  'Destroyer of Worlds',
  'The Deathstone Knight',
  'Creator of Life',
  'The Soulstone Witch',
  'Guardian of Gates',
  'The Mindstone Sage',
  'Master of Illusions',
  'The Heartstone King',
  'Wielder of Chaos',
  'The Orderstone Queen',
  'Seeker of Power',
  'The Wisdomstone Elder',
  'Bringer of Justice',
  'The Mercystone Healer',
  'Voice of the Ancients',
  'The Wrathstone Berserker',
  'Keeper of Promises',
  'The Hopestore Saint',
  'Bearer of Destiny',
  'The Fatestone Oracle',
  'Walker of Paths',
  'The Choicestone Guide',
  'Dancer in Starlight',
  'The Cosmicstone Voyager',
  'Singer of Creation',
  'The Genesisstone First',
  'Keeper of Endings',
  'The Omegastone Last',
  'The Alpha and Omega',
  'The Infinitestone One',
];

// Story fragments for NFTs
const storyTemplates = [
  'Born from the primordial chaos, this being witnessed the birth of stars and the death of gods.',
  'In the ancient texts, they speak of a figure who walked between worlds, never staying long enough to leave a shadow.',
  'The prophecy foretold their coming - a harbinger of change that would reshape the very fabric of reality.',
  'Deep within the forgotten temples, their name is whispered with reverence and fear.',
  'They say on moonless nights, you can still hear the echoes of their footsteps across the endless void.',
  'Once mortal, they transcended the boundaries of existence to become something both less and more than human.',
  'The chronicles record their deeds in languages that no longer have speakers.',
  'From the ashes of the old world, they arose to guide the lost and illuminate the path forward.',
  'Their power is matched only by their wisdom, earned through millennia of silent observation.',
  'The cosmos itself bends to their will, for they are the bridge between what was and what shall be.',
];

interface SeedStats {
  totalNfts: number;
  ownedCount: number;
  claimedCount: number;
  snapshotCount: number;
}

async function getStats(): Promise<SeedStats> {
  const [nftCount] = await db.select({ count: count() }).from(nftCollection);
  const [ownedCount] = await db.select({ count: count() }).from(nftOwnership);
  const [claimedCount] = await db.select({ count: count() }).from(nftClaims);
  const [snapshotCount] = await db.select({ count: count() }).from(nftSnapshot);

  return {
    totalNfts: nftCount?.count ?? 0,
    ownedCount: ownedCount?.count ?? 0,
    claimedCount: claimedCount?.count ?? 0,
    snapshotCount: snapshotCount?.count ?? 0,
  };
}

async function clearCollection(): Promise<void> {
  logger.info('Clearing existing NFT collection data...', undefined, 'SeedNFT');

  await db.delete(nftClaims);
  await db.delete(nftOwnership);
  await db.delete(nftSnapshot);
  await db.delete(nftCollection);

  logger.info('Collection cleared', undefined, 'SeedNFT');
}

async function seedCollection(): Promise<void> {
  logger.info(`Seeding ${TOTAL_NFTS} NFTs...`, undefined, 'SeedNFT');

  const now = new Date();

  for (let i = 0; i < TOTAL_NFTS; i++) {
    const tokenId = i + 1;
    const name = nftNames[i] ?? `Babylon #${tokenId}`;
    const storyTemplate = storyTemplates[i % storyTemplates.length]!;

    await db.insert(nftCollection).values({
      id: nanoid(),
      tokenId,
      name,
      description: `A unique piece from the Babylon Top 100 Collection. Token #${tokenId} of 100.`,
      imageUrl: getPlaceholderImage(tokenId),
      thumbnailUrl: getPlaceholderThumbnail(tokenId),
      imageCid: null, // Will be set when actual images are uploaded
      storyTitle: name,
      storyContent: storyTemplate,
      metadataUri: null, // Will be set when metadata is uploaded to IPFS
      attributes: [
        { trait_type: 'Collection', value: 'Babylon Top 100' },
        { trait_type: 'Token Number', value: tokenId },
        { trait_type: 'Edition', value: 'Genesis' },
      ],
      contractAddress: PLACEHOLDER_CONTRACT,
      chainId: PLACEHOLDER_CHAIN_ID,
      createdAt: now,
      updatedAt: now,
    });

    if (tokenId % 10 === 0) {
      logger.info(`Seeded ${tokenId}/${TOTAL_NFTS} NFTs`, undefined, 'SeedNFT');
    }
  }

  logger.info(`Successfully seeded ${TOTAL_NFTS} NFTs`, undefined, 'SeedNFT');
}

async function takeLeaderboardSnapshot(): Promise<void> {
  logger.info(
    'Taking leaderboard snapshot for NFT eligibility...',
    undefined,
    'SeedNFT'
  );

  const snapshotTime = new Date();

  // Fetch top 100 users
  const leaderboardResult = await PointsService.getLeaderboard(
    1,
    100,
    0,
    'all'
  );
  const topUsers = leaderboardResult.users;

  logger.info(
    `Found ${topUsers.length} users for snapshot`,
    undefined,
    'SeedNFT'
  );

  // Clear existing snapshots (except those who have minted)
  const existingSnapshots = await db
    .select({
      userId: nftSnapshot.userId,
      hasMinted: nftSnapshot.hasMinted,
    })
    .from(nftSnapshot);

  const mintedUserIds = new Set(
    existingSnapshots.filter((s) => s.hasMinted).map((s) => s.userId)
  );

  // Delete non-minted snapshots
  for (const snapshot of existingSnapshots) {
    if (!snapshot.hasMinted) {
      await db
        .delete(nftSnapshot)
        .where(eq(nftSnapshot.userId, snapshot.userId));
    }
  }

  // Insert new snapshots
  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i]!;
    const rank = i + 1;

    // Skip if user has already minted
    if (mintedUserIds.has(user.id)) {
      continue;
    }

    await db.insert(nftSnapshot).values({
      id: nanoid(),
      userId: user.id,
      walletAddress: null, // Will be populated from users table
      rank,
      points: user.allPoints,
      snapshotTakenAt: snapshotTime,
      hasMinted: false,
    });
  }

  logger.info(
    `Snapshot complete: ${topUsers.length} users eligible (${mintedUserIds.size} already minted)`,
    { snapshotTime: snapshotTime.toISOString() },
    'SeedNFT'
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const forceReseed = args.includes('--force');
  const showStats = args.includes('--stats');
  const takeSnapshot = args.includes('--snapshot');

  logger.info(
    '════════════════════════════════════════════════════════════',
    undefined,
    'SeedNFT'
  );
  logger.info(
    'Babylon NFT Collection Seeder',
    { forceReseed, showStats, takeSnapshot },
    'SeedNFT'
  );
  logger.info(
    '════════════════════════════════════════════════════════════',
    undefined,
    'SeedNFT'
  );

  if (showStats) {
    const stats = await getStats();
    logger.info('NFT Collection Statistics', stats, 'SeedNFT');
    await closeDatabase();
    return;
  }

  if (takeSnapshot) {
    await takeLeaderboardSnapshot();
    await closeDatabase();
    return;
  }

  const stats = await getStats();

  if (stats.totalNfts > 0 && !forceReseed) {
    logger.info(
      `Collection already seeded with ${stats.totalNfts} NFTs. Use --force to reseed.`,
      undefined,
      'SeedNFT'
    );
    await closeDatabase();
    return;
  }

  if (forceReseed && stats.totalNfts > 0) {
    await clearCollection();
  }

  await seedCollection();

  const finalStats = await getStats();
  logger.info('Seeding complete', finalStats, 'SeedNFT');

  await closeDatabase();
}

main().catch((error) => {
  logger.error('Seeding failed', { error: String(error) }, 'SeedNFT');
  process.exit(1);
});
