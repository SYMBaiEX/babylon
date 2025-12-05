import { db, organizations, perpMarketSnapshots } from '@babylon/db';

/**
 * One-off script to initialize PerpMarketSnapshot from organizations that have a ticker/price.
 */
async function main() {
  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      ticker: organizations.ticker,
      currentPrice: organizations.currentPrice,
      initialPrice: organizations.initialPrice,
      type: organizations.type,
    })
    .from(organizations);

  const candidates = orgs.filter(
    (o) =>
      (o.currentPrice !== null || o.initialPrice !== null) &&
      o.ticker !== null &&
      o.ticker !== undefined
  );

  if (candidates.length === 0) {
    console.log('No organizations with price/ticker found, nothing to seed.');
    return;
  }

  const now = new Date();
  const rows = candidates.map((o) => ({
    ticker: o.ticker!,
    organizationId: o.id,
    name: o.name,
    currentPrice: Number(o.currentPrice ?? o.initialPrice ?? 0),
    change24h: 0,
    changePercent24h: 0,
    high24h: Number(o.currentPrice ?? o.initialPrice ?? 0),
    low24h: Number(o.currentPrice ?? o.initialPrice ?? 0),
    volume24h: 0,
    openInterest: 0,
    fundingRate: {
      rate: 0,
      nextFundingTime: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
      predictedRate: 0,
    },
    maxLeverage: 100,
    minOrderSize: 10,
    markPrice: Number(o.currentPrice ?? o.initialPrice ?? 0),
    indexPrice: Number(o.currentPrice ?? o.initialPrice ?? 0),
    createdAt: now,
    updatedAt: now,
  }));

  await db
    .insert(perpMarketSnapshots)
    .values(rows)
    .onConflictDoNothing({ target: perpMarketSnapshots.ticker });

  console.log(`Seeded ${rows.length} PerpMarketSnapshot rows`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit(0));
