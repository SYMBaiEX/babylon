#!/usr/bin/env bun
/**
 * Test prediction market trading
 */

import { prisma } from '../src/lib/prisma';
import { PredictionPricing } from '../src/lib/prediction-pricing';
import { Prisma } from '@prisma/client';

async function main() {
  console.log('🎯 TESTING PREDICTION MARKET TRADING\n');

  // Get test market
  const market = await prisma.market.findFirst({
    where: { resolved: false },
  });

  if (!market) {
    console.log('❌ No active markets found\n');
    process.exit(1);
  }

  console.log(`Market: ${market.question}`);
  console.log(`Initial state:`);
  console.log(`  YES: ${Number(market.yesShares).toFixed(2)} shares`);
  console.log(`  NO: ${Number(market.noShares).toFixed(2)} shares`);

  const initialK = Number(market.yesShares) * Number(market.noShares);
  console.log(`  K: ${initialK.toFixed(2)}\n`);

  // Calculate buy
  const calc = PredictionPricing.calculateBuy(
    Number(market.yesShares),
    Number(market.noShares),
    'yes',
    100
  );

  console.log(`Buying YES for $100:`);
  console.log(`  Shares bought: ${calc.sharesBought.toFixed(2)}`);
  console.log(`  Avg price: $${calc.avgPrice.toFixed(4)}`);
  console.log(`  New YES price: ${(calc.newYesPrice * 100).toFixed(2)}%`);
  console.log(`  Price impact: ${calc.priceImpact.toFixed(2)}%\n`);

  // Execute trade in database
  await prisma.market.update({
    where: { id: market.id },
    data: {
      yesShares: new Prisma.Decimal(calc.newYesShares),
      noShares: new Prisma.Decimal(calc.newNoShares),
      liquidity: { increment: new Prisma.Decimal(100) },
    },
  });

  console.log(`✅ Trade executed in database\n`);

  // Verify reserves
  const updated = await prisma.market.findUnique({
    where: { id: market.id },
  });

  console.log(`Final state:`);
  console.log(`  YES: ${Number(updated!.yesShares).toFixed(2)} shares (was ${Number(market.yesShares).toFixed(2)})`);
  console.log(`  NO: ${Number(updated!.noShares).toFixed(2)} shares (was ${Number(market.noShares).toFixed(2)})`);

  const finalK = Number(updated!.yesShares) * Number(updated!.noShares);
  console.log(`  K: ${finalK.toFixed(2)}\n`);

  const kDiff = Math.abs(finalK - initialK) / initialK;
  console.log(`K invariant check: ${(kDiff * 100).toFixed(4)}% difference`);

  if (kDiff < 0.001) {
    console.log(`✅ K invariant holds!\n`);
  } else {
    console.log(`❌ K invariant broken!\n`);
    process.exit(1);
  }

  await prisma.$disconnect();
}

main();

