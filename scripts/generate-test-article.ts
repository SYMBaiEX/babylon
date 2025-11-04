/**
 * Generate Test Article
 * 
 * Creates a test article to verify the Latest News system is working
 */

import { prisma } from '../src/lib/prisma';
import { logger } from '../src/lib/logger';

async function main() {
  logger.info('Generating test article...', undefined, 'Script');

  // Get a news organization
  const newsOrg = await prisma.organization.findFirst({
    where: { type: 'media' },
  });

  if (!newsOrg) {
    logger.error('No news organizations found. Run seed first.', undefined, 'Script');
    return;
  }

  // Get an actor affiliated with this org for byline
  const journalist = await prisma.actor.findFirst({
    where: {
      affiliations: {
        has: newsOrg.id,
      },
    },
  });

  // Create test article
  const article = await prisma.post.create({
    data: {
      type: 'article',
      content: 'Breaking developments in the tech industry suggest major shifts ahead. Industry insiders report unprecedented changes that could reshape the entire sector.',
      fullContent: `Breaking developments in the tech industry suggest major shifts ahead. Industry insiders report unprecedented changes that could reshape the entire sector.

According to sources close to the matter, several key players have been meeting behind closed doors to discuss strategic partnerships that could change the competitive landscape dramatically.

"This is a pivotal moment for the industry," one anonymous executive told ${newsOrg.name}. "What happens next will define the next decade of innovation."

The developments come amid growing scrutiny from regulators and increasing pressure from investors to demonstrate sustainable growth. Companies are reportedly exploring new business models and revenue streams to adapt to changing market conditions.

Market analysts have expressed cautious optimism about the potential outcomes, though many warn that significant challenges remain. The situation continues to evolve rapidly, with new information emerging daily.

${newsOrg.name} will continue to monitor this story as it develops and provide updates as more information becomes available.`,
      articleTitle: 'Tech Industry Faces Major Shifts Amid Behind-the-Scenes Negotiations',
      byline: journalist ? `By ${journalist.name}` : 'Staff Writer',
      biasScore: 0.3, // Slightly favorable
      sentiment: 'neutral',
      slant: 'Cautiously optimistic about industry changes',
      category: 'tech',
      authorId: newsOrg.id,
      gameId: 'continuous',
      dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
      timestamp: new Date(),
    },
  });

  logger.info('Test article created successfully!', { 
    id: article.id,
    title: article.articleTitle,
    org: newsOrg.name 
  }, 'Script');
  
  console.log('\n✅ Test article created!');
  console.log(`   ID: ${article.id}`);
  console.log(`   Title: ${article.articleTitle}`);
  console.log(`   Author: ${newsOrg.name}`);
  console.log(`\n   View at: http://localhost:3000/post/${article.id}`);
  console.log(`   Or check Latest News sidebar at: http://localhost:3000/feed\n`);
}

main()
  .catch((error) => {
    logger.error('Error generating test article:', error, 'Script');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

