import { describe, expect, it } from 'bun:test';
import type { PortfolioPnLSnapshot } from '@babylon/engine/client';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortfolioPnLCard } from '../../../../apps/web/src/components/markets/PortfolioPnLCard';

const snapshot: PortfolioPnLSnapshot = {
  lifetimePnL: 0,
  netContributions: 0,
  totalDeposited: 0,
  totalWithdrawn: 0,
  availableBalance: 0,
  unrealizedPerpPnL: 0,
  unrealizedPredictionPnL: 0,
  totalUnrealizedPnL: 0,
  totalPnL: 0,
  accountEquity: 0,
};

describe('PortfolioPnLCard rendering', () => {
  const noop = () => {};

  it('disabled when loading', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioPnLCard, {
        data: snapshot,
        loading: true,
        onShare: noop,
        onShowBuyPoints: noop,
      })
    );
    expect(html).toMatch(/<button[^>]*\sdisabled(=|\s|>)[^>]*>.*Share P&amp;L/);
  });

  it('disabled when no data', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioPnLCard, {
        data: null,
        loading: false,
        onShare: noop,
        onShowBuyPoints: noop,
      })
    );
    expect(html).toMatch(/<button[^>]*\sdisabled(=|\s|>)[^>]*>.*Share P&amp;L/);
  });

  it('enabled when has data and not loading', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioPnLCard, {
        data: snapshot,
        loading: false,
        onShare: noop,
        onShowBuyPoints: noop,
      })
    );
    expect(html).not.toMatch(
      /<button[^>]*\sdisabled(=|\s|>)[^>]*>.*Share P&amp;L/
    );
  });

  it('adds an accessible name for Buy Points', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioPnLCard, {
        data: snapshot,
        loading: false,
        onShare: noop,
        onShowBuyPoints: noop,
      })
    );
    expect(html).toContain('aria-label="Buy Points"');
  });
});
