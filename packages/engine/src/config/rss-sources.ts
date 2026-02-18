/**
 * Default RSS feed sources for news generation (inbound: we consume these feeds).
 *
 * WHY this file: "Where do we put RSS feed URLs?" should have one answer. This config
 * is the single place for the default list; bootstrap seeds rssFeedSources from it,
 * and the engine only reads from the DB at runtime. Add or edit sources here;
 * runtime enable/disable stays in DB (isActive) so we can turn feeds off without a deploy.
 */

export interface RssSourceConfig {
  name: string;
  feedUrl: string;
  category: string;
}

export const DEFAULT_RSS_SOURCES: RssSourceConfig[] = [
  {
    name: 'New York Times - Technology',
    feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    category: 'tech',
  },
  {
    name: 'New York Times - Business',
    feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    category: 'business',
  },
  {
    name: 'TechCrunch',
    feedUrl: 'https://techcrunch.com/feed/',
    category: 'tech',
  },
  {
    name: 'Ars Technica',
    feedUrl: 'https://feeds.arstechnica.com/arstechnica/index',
    category: 'tech',
  },
  {
    name: 'The Verge',
    feedUrl: 'https://www.theverge.com/rss/index.xml',
    category: 'tech',
  },
  {
    name: 'Wired',
    feedUrl: 'https://www.wired.com/feed/rss',
    category: 'tech',
  },
  {
    name: 'CoinDesk',
    feedUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    category: 'crypto',
  },
  {
    name: 'Cointelegraph',
    feedUrl: 'https://cointelegraph.com/rss',
    category: 'crypto',
  },
  {
    name: 'BBC - Technology',
    feedUrl: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
    category: 'tech',
  },
];
