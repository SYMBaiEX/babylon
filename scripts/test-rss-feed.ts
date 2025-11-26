
import { rssFeedService } from '../src/lib/services/rss-feed-service';
import { logger } from '../src/lib/logger';

async function main() {
  logger.info('Testing BBC RSS feed...');
  const url = 'https://feeds.bbci.co.uk/news/technology/rss.xml';
  
  try {
    const feed = await rssFeedService.fetchFeed(url);
    logger.info(`Successfully fetched feed: ${feed.title}`);
    logger.info(`Found ${feed.items.length} items.`);
    const firstItem = feed.items[0];
    if (firstItem) {
        logger.info(`First item: ${firstItem.title}`);
    }
  } catch (error) {
    logger.error('Failed to fetch feed', { error });
  }
}

main();

