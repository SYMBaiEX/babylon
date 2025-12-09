import type { PerpSide } from './types';

export function shouldLiquidate(
  currentPrice: number,
  liquidationPrice: number,
  side: PerpSide
): boolean {
  if (side === 'long') {
    return currentPrice <= liquidationPrice;
  }
  return currentPrice >= liquidationPrice;
}
