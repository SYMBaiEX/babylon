/**
 * Initialize Reputation Points for Actor Traders with Pools
 * 
 * Sets reputationPoints to 10,000 and profileImageUrl for all actors with hasPool=true
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function initActorPoints() {
  try {
    console.log('🔄 Initializing reputation points for actor traders...');
    
    // Get all actors with pools
    const poolActors = await prisma.actor.findMany({
      where: { hasPool: true },
      select: { id: true, name: true, reputationPoints: true, profileImageUrl: true },
    });
    
    console.log(`📊 Found ${poolActors.length} actors with pools`);
    
    let updated = 0;
    for (const actor of poolActors) {
      // Check if image file exists for this actor
      const imagePath = path.join(process.cwd(), 'public', 'images', 'actors', `${actor.id}.jpg`);
      const hasImage = fs.existsSync(imagePath);
      const imageUrl = hasImage ? `/images/actors/${actor.id}.jpg` : null;
      
      const needsUpdate = actor.reputationPoints !== 10000 || 
                         (hasImage && actor.profileImageUrl !== imageUrl);
      
      if (needsUpdate) {
        await prisma.actor.update({
          where: { id: actor.id },
          data: {
            reputationPoints: 10000,
            ...(imageUrl && { profileImageUrl: imageUrl }),
          },
        });
        console.log(`  ✅ Updated ${actor.name} to 10,000 points${imageUrl ? ' with image' : ''}`);
        updated++;
      } else {
        console.log(`  ⏭️  ${actor.name} already configured`);
      }
    }
    
    console.log(`\n✅ Updated ${updated} actors`);
    console.log(`✅ ${poolActors.length - updated} actors already configured`);
  } catch (error) {
    console.error('❌ Error initializing actor points:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

initActorPoints()
  .then(() => {
    console.log('\n✅ Actor points initialization complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to initialize actor points:', error);
    process.exit(1);
  });

