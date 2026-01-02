import { StaticDataRegistry } from '@babylon/engine';

export interface ResolvedPerpMarket {
  ticker: string;
  organizationId: string;
  name: string;
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');

/**
 * Resolve a user-provided perp identifier (ticker/name/id) to a canonical ticker.
 * Accepts case-insensitive ticker symbols, organization IDs, parody names,
 * original names, and common handles.
 */
export function resolvePerpTicker(
  identifier?: string | null
): ResolvedPerpMarket | null {
  if (!identifier) return null;

  const trimmed = identifier.trim();
  if (!trimmed) {
    return null;
  }

  const allOrgs = StaticDataRegistry.getAllOrganizations().filter(
    (org) => org.ticker && org.type === 'company'
  );

  const lower = trimmed.toLowerCase();
  const normalized = normalize(trimmed);

  const matchers: Array<(org: (typeof allOrgs)[number]) => boolean> = [
    (org) => org.ticker?.toLowerCase() === lower,
    (org) => org.id.toLowerCase() === lower,
    (org) => org.name.toLowerCase() === lower,
    (org) => org.originalName?.toLowerCase() === lower,
    (org) => org.originalHandle?.toLowerCase() === lower,
    (org) => normalize(org.ticker ?? '') === normalized,
    (org) => normalize(org.id) === normalized,
    (org) => normalize(org.name) === normalized,
    (org) => normalize(org.originalName ?? '') === normalized,
    (org) => normalize(org.originalHandle ?? '') === normalized,
  ];

  for (const matcher of matchers) {
    const found = allOrgs.find(matcher);
    if (found?.ticker) {
      return {
        ticker: found.ticker,
        organizationId: found.id,
        name: found.name,
      };
    }
  }

  // Partial match fallback for longer identifiers (e.g., "tesla stock")
  if (normalized.length >= 3) {
    const partial = allOrgs.find((org) => {
      const normalizedTicker = normalize(org.ticker ?? '');
      const normalizedName = normalize(org.name);
      const normalizedOriginal = normalize(org.originalName ?? '');

      return (
        normalizedTicker.includes(normalized) ||
        normalizedName.includes(normalized) ||
        normalizedOriginal.includes(normalized)
      );
    });

    if (partial?.ticker) {
      return {
        ticker: partial.ticker,
        organizationId: partial.id,
        name: partial.name,
      };
    }
  }

  return null;
}
