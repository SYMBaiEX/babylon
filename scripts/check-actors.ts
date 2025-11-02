import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkActors() {
  const actors = await prisma.actor.findMany({
    select: {
      id: true,
      name: true,
      hasPool: true,
      reputationPoints: true,
      profileImageUrl: true,
    },
  });
  
  console.log(`Total actors: ${actors.length}`);
  console.log(`Actors with pools: ${actors.filter(a => a.hasPool).length}`);
  console.log('\nActors with pools:');
  actors.filter(a => a.hasPool).forEach(a => {
    console.log(`  - ${a.name} (${a.id}): ${a.reputationPoints} pts, image: ${a.profileImageUrl || 'none'}`);
  });
  
  await prisma.$disconnect();
}

checkActors();

