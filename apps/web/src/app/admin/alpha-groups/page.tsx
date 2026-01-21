/**
 * Admin Alpha Groups Dashboard Page
 *
 * @description Admin page for monitoring and managing alpha group dynamics.
 * Displays invitation statistics, tier distribution, configuration,
 * and recent activity for NPC alpha groups.
 *
 * @page /admin/alpha-groups
 * @access Admin with view_alpha_groups permission
 */

'use client';

import { cn } from '@babylon/shared';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Crown,
  RefreshCw,
  Settings,
  Shield,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

/**
 * Zod schema for tier statistics.
 */
const TierStatsSchema = z.object({
  name: z.string(),
  current: z.number(),
  max: z.number(),
  fillRate: z.number(),
});

/**
 * Zod schema for invite stats.
 */
const InviteStatsSchema = z.object({
  total: z.number(),
  pending: z.number(),
  accepted: z.number(),
  declined: z.number(),
  acceptanceRate: z.number(),
  last24h: z.number(),
  lastWeek: z.number(),
});

/**
 * Zod schema for the full stats response.
 */
const AlphaGroupStatsSchema = z.object({
  success: z.boolean(),
  data: z.object({
    overview: z.object({
      totalNpcs: z.number(),
      totalGroups: z.number(),
      totalMembers: z.number(),
      totalCapacity: z.number(),
      overallFillRate: z.number(),
    }),
    invites: InviteStatsSchema,
    joins: z.object({
      last24h: z.number(),
      lastWeek: z.number(),
    }),
    tiers: z.record(z.string(), TierStatsSchema),
    grandfathering: z.object({
      grandfatheredMembers: z.number(),
      grandfatheringEnabled: z.boolean(),
    }),
    inviteDecay: z.object({
      enabled: z.boolean(),
      usersWithDeclines: z.number(),
      usersAtMaxDeclines: z.number(),
      maxDeclines: z.number(),
      baseHours: z.number(),
      maxHours: z.number(),
    }),
    config: z.object({
      inviteProbabilityMultiplier: z.number(),
      maxInvitesPerTick: z.number(),
      inviteCooldownHours: z.number(),
      fastTrackEnabled: z.boolean(),
      includeTradingActivity: z.boolean(),
      perNpcCustomizationEnabled: z.boolean(),
    }),
    thresholds: z.object({
      minReplies: z.number(),
      minLikes: z.number(),
      minTotalInteractions: z.number(),
      minQualityScore: z.number(),
    }),
    timestamp: z.string(),
  }),
});

type AlphaGroupStats = z.infer<typeof AlphaGroupStatsSchema>['data'];

/**
 * Zod schema for config response.
 */
const AlphaGroupConfigSchema = z.object({
  success: z.boolean(),
  data: z.object({
    config: z.record(
      z.string(),
      z.union([z.number(), z.boolean(), z.object({}).passthrough()])
    ),
    tierConfig: z.record(
      z.string(),
      z.object({
        name: z.string(),
        minEngagementScore: z.number(),
        inviteProbability: z.number(),
        maxMembers: z.number(),
        alphaLevel: z.string(),
        promotionWaitDays: z.number(),
        demotionInactiveDays: z.number(),
      })
    ),
    instructions: z.object({
      howToUpdate: z.string(),
      effectiveImmediately: z.string(),
      documentation: z.string(),
    }),
  }),
});

type AlphaGroupConfig = z.infer<typeof AlphaGroupConfigSchema>['data'];

/**
 * Format percentage for display.
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Get color class based on fill rate.
 */
function getFillRateColor(rate: number): string {
  if (rate < 0.5) return 'text-green-400';
  if (rate < 0.75) return 'text-yellow-400';
  if (rate < 0.9) return 'text-orange-400';
  return 'text-red-400';
}

/**
 * Get color class for tier.
 */
function getTierColor(tier: string): string {
  switch (tier) {
    case '1':
      return 'bg-purple-600/20 text-purple-300 border-purple-500';
    case '2':
      return 'bg-blue-600/20 text-blue-300 border-blue-500';
    case '3':
      return 'bg-green-600/20 text-green-300 border-green-500';
    default:
      return 'bg-gray-600/20 text-gray-300 border-gray-500';
  }
}

export default function AdminAlphaGroupsPage() {
  const [stats, setStats] = useState<AlphaGroupStats | null>(null);
  const [config, setConfig] = useState<AlphaGroupConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  /**
   * Fetch alpha group statistics.
   */
  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetch('/api/admin/alpha-groups/stats', {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      setError(`Failed to fetch stats: ${response.status} - ${errorText}`);
      setIsLoading(false);
      return;
    }

    const json = await response.json();
    const parsed = AlphaGroupStatsSchema.safeParse(json);

    if (!parsed.success) {
      setError(`Invalid response format: ${parsed.error.message}`);
      setIsLoading(false);
      return;
    }

    setStats(parsed.data.data);
    setIsLoading(false);
  }, []);

  /**
   * Fetch alpha group configuration.
   */
  const fetchConfig = useCallback(async () => {
    const response = await fetch('/api/admin/alpha-groups/config', {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return;
    }

    const json = await response.json();
    const parsed = AlphaGroupConfigSchema.safeParse(json);

    if (parsed.success) {
      setConfig(parsed.data.data);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchConfig();
  }, [fetchStats, fetchConfig]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-100">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-400" />
          <p className="text-lg">Loading alpha group data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-100">
        <div className="flex flex-col items-center gap-4 text-center">
          <Shield className="h-12 w-12 text-red-400" />
          <h2 className="font-semibold text-red-400 text-xl">Error</h2>
          <p className="max-w-md text-gray-400">{error}</p>
          <button
            onClick={fetchStats}
            className="mt-4 rounded-lg bg-indigo-600 px-6 py-2 text-white hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-gray-100">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-3xl text-white">Alpha Groups</h1>
            <p className="mt-1 text-gray-400">
              Monitor and manage NPC group invite dynamics
            </p>
          </div>
          <button
            onClick={() => {
              fetchStats();
              fetchConfig();
            }}
            className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-gray-300 hover:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* Overview Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-600/20 p-3">
                <Users className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Total Members</p>
                <p className="font-bold text-2xl">
                  {stats.overview.totalMembers}
                </p>
              </div>
            </div>
            <p className="mt-2 text-gray-500 text-sm">
              of {stats.overview.totalCapacity} capacity (
              {formatPercent(stats.overview.overallFillRate)})
            </p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-600/20 p-3">
                <TrendingUp className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Joins (24h)</p>
                <p className="font-bold text-2xl">{stats.joins.last24h}</p>
              </div>
            </div>
            <p className="mt-2 text-gray-500 text-sm">
              {stats.joins.lastWeek} in last 7 days
            </p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-600/20 p-3">
                <Activity className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Invites (24h)</p>
                <p className="font-bold text-2xl">{stats.invites.last24h}</p>
              </div>
            </div>
            <p className="mt-2 text-gray-500 text-sm">
              {formatPercent(stats.invites.acceptanceRate)} acceptance rate
            </p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-600/20 p-3">
                <Crown className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">NPC Groups</p>
                <p className="font-bold text-2xl">
                  {stats.overview.totalGroups}
                </p>
              </div>
            </div>
            <p className="mt-2 text-gray-500 text-sm">
              across {stats.overview.totalNpcs} NPCs
            </p>
          </div>
        </div>

        {/* Tier Distribution */}
        <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 font-semibold text-xl">Tier Distribution</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Object.entries(stats.tiers).map(([tierId, tier]) => (
              <div
                key={tierId}
                className={cn('rounded-lg border p-4', getTierColor(tierId))}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{tier.name}</h3>
                  <span className="text-sm">Tier {tierId}</span>
                </div>
                <div className="mt-2">
                  <div className="flex items-end justify-between">
                    <span className="font-bold text-2xl">{tier.current}</span>
                    <span className="text-sm opacity-70">/ {tier.max}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-gray-700">
                    <div
                      className={cn(
                        'h-2 rounded-full',
                        tier.fillRate < 0.75
                          ? 'bg-green-500'
                          : tier.fillRate < 0.9
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      )}
                      style={{
                        width: `${Math.min(100, tier.fillRate * 100)}%`,
                      }}
                    />
                  </div>
                  <p
                    className={cn(
                      'mt-1 text-sm',
                      getFillRateColor(tier.fillRate)
                    )}
                  >
                    {formatPercent(tier.fillRate)} full
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invite Statistics */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-4 font-semibold text-xl">Invite Statistics</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Total Invites</span>
                <span className="font-semibold">{stats.invites.total}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Pending</span>
                <span className="font-semibold text-yellow-400">
                  {stats.invites.pending}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Accepted</span>
                <span className="font-semibold text-green-400">
                  {stats.invites.accepted}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Declined</span>
                <span className="font-semibold text-red-400">
                  {stats.invites.declined}
                </span>
              </div>
              <div className="border-gray-700 border-t pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Acceptance Rate</span>
                  <span className="font-semibold text-indigo-400">
                    {formatPercent(stats.invites.acceptanceRate)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-4 font-semibold text-xl">Invite Decay</h2>
            {stats.inviteDecay.enabled ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Status</span>
                  <span className="rounded-full bg-green-600/20 px-3 py-1 text-green-400 text-sm">
                    Enabled
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Users with Declines</span>
                  <span className="font-semibold">
                    {stats.inviteDecay.usersWithDeclines}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">At Max Declines</span>
                  <span className="font-semibold text-red-400">
                    {stats.inviteDecay.usersAtMaxDeclines}
                  </span>
                </div>
                <div className="border-gray-700 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Max Declines</span>
                    <span className="font-semibold">
                      {stats.inviteDecay.maxDeclines}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-gray-400">Base Cooldown</span>
                    <span className="font-semibold">
                      {stats.inviteDecay.baseHours}h
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-gray-400">Max Cooldown</span>
                    <span className="font-semibold">
                      {stats.inviteDecay.maxHours}h
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <span className="rounded-full bg-gray-700 px-4 py-2 text-gray-400">
                  Invite decay is disabled
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Grandfathering */}
        <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-xl">Grandfathering</h2>
            <span
              className={cn(
                'rounded-full px-3 py-1 text-sm',
                stats.grandfathering.grandfatheringEnabled
                  ? 'bg-green-600/20 text-green-400'
                  : 'bg-gray-700 text-gray-400'
              )}
            >
              {stats.grandfathering.grandfatheringEnabled
                ? 'Enabled'
                : 'Disabled'}
            </span>
          </div>
          <p className="mt-2 text-gray-400">
            Existing members protected from stricter thresholds
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-400" />
            <span className="font-bold text-2xl">
              {stats.grandfathering.grandfatheredMembers}
            </span>
            <span className="text-gray-400">grandfathered members</span>
          </div>
        </div>

        {/* Configuration Toggle */}
        <div className="rounded-xl border border-gray-800 bg-gray-900">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex w-full items-center justify-between p-6 text-left hover:bg-gray-800/50"
          >
            <div className="flex items-center gap-3">
              <Settings className="h-6 w-6 text-gray-400" />
              <div>
                <h2 className="font-semibold text-xl">Configuration</h2>
                <p className="text-gray-400 text-sm">
                  Current thresholds and settings
                </p>
              </div>
            </div>
            {showConfig ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>

          {showConfig && config && (
            <div className="border-gray-800 border-t p-6">
              {/* Thresholds */}
              <div className="mb-6">
                <h3 className="mb-3 font-semibold text-gray-300 text-lg">
                  Eligibility Thresholds
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg bg-gray-800 p-4">
                    <p className="text-gray-400 text-sm">Min Replies</p>
                    <p className="font-bold text-xl">
                      {stats.thresholds.minReplies}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-800 p-4">
                    <p className="text-gray-400 text-sm">Min Likes</p>
                    <p className="font-bold text-xl">
                      {stats.thresholds.minLikes}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-800 p-4">
                    <p className="text-gray-400 text-sm">Min Total</p>
                    <p className="font-bold text-xl">
                      {stats.thresholds.minTotalInteractions}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-800 p-4">
                    <p className="text-gray-400 text-sm">Min Quality</p>
                    <p className="font-bold text-xl">
                      {stats.thresholds.minQualityScore}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tier Config */}
              <div className="mb-6">
                <h3 className="mb-3 font-semibold text-gray-300 text-lg">
                  Tier Settings
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-gray-700 border-b">
                        <th className="pr-4 pb-3 text-gray-400">Tier</th>
                        <th className="pr-4 pb-3 text-gray-400">Min Score</th>
                        <th className="pr-4 pb-3 text-gray-400">
                          Invite Prob.
                        </th>
                        <th className="pr-4 pb-3 text-gray-400">Max Members</th>
                        <th className="pr-4 pb-3 text-gray-400">Promo Wait</th>
                        <th className="pb-3 text-gray-400">Alpha Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(config.tierConfig).map(
                        ([tier, tierConf]) => (
                          <tr key={tier} className="border-gray-800 border-b">
                            <td className="py-3 pr-4">
                              <span
                                className={cn(
                                  'rounded px-2 py-1 text-xs',
                                  getTierColor(tier)
                                )}
                              >
                                {tierConf.name}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              {tierConf.minEngagementScore}
                            </td>
                            <td className="py-3 pr-4">
                              {formatPercent(tierConf.inviteProbability)}
                            </td>
                            <td className="py-3 pr-4">{tierConf.maxMembers}</td>
                            <td className="py-3 pr-4">
                              {tierConf.promotionWaitDays} days
                            </td>
                            <td className="py-3">{tierConf.alphaLevel}</td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Feature Flags */}
              <div>
                <h3 className="mb-3 font-semibold text-gray-300 text-lg">
                  Feature Flags
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-3 w-3 rounded-full',
                        stats.config.fastTrackEnabled
                          ? 'bg-green-500'
                          : 'bg-gray-600'
                      )}
                    />
                    <span className="text-gray-300">Fast Track</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-3 w-3 rounded-full',
                        stats.config.includeTradingActivity
                          ? 'bg-green-500'
                          : 'bg-gray-600'
                      )}
                    />
                    <span className="text-gray-300">Trading Activity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-3 w-3 rounded-full',
                        stats.config.perNpcCustomizationEnabled
                          ? 'bg-green-500'
                          : 'bg-gray-600'
                      )}
                    />
                    <span className="text-gray-300">Per-NPC Customization</span>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="mt-6 rounded-lg bg-gray-800 p-4">
                <h4 className="font-semibold text-yellow-400">How to Update</h4>
                <p className="mt-2 text-gray-400 text-sm">
                  {config.instructions.howToUpdate}
                </p>
                <p className="mt-1 text-gray-500 text-sm">
                  See{' '}
                  <code className="rounded bg-gray-700 px-1 py-0.5">
                    ALPHA_GROUP_THRESHOLD_PLAN.md
                  </code>{' '}
                  for full documentation.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Timestamp */}
        <p className="mt-6 text-center text-gray-500 text-sm">
          Last updated: {new Date(stats.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
