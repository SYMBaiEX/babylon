'use client';

import { cn } from '@babylon/shared';
import {
  CheckCircle,
  Download,
  Loader2,
  Plus,
  Search,
  Settings,
  Shield,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/shared/Skeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WhitelistSource = 'snapshot_first_100' | 'admin_manual' | 'leaderboard';

interface WhitelistEntry {
  id: string;
  userId: string;
  source: WhitelistSource;
  reason: string | null;
  grantedBy: string | null;
  grantedAt: string;
  revokedAt: string | null;
  username: string | null;
  displayName: string | null;
  walletAddress: string | null;
  profileImageUrl: string | null;
}

interface WhitelistStats {
  total: number;
  snapshot_first_100: number;
  admin_manual: number;
  leaderboard: number;
}

interface WhitelistConfig {
  leaderboardRankThreshold: number | null;
  leaderboardCategory: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

type FilterSource = 'all' | WhitelistSource;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WhitelistTab() {
  // Data state
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [stats, setStats] = useState<WhitelistStats | null>(null);
  const [config, setConfig] = useState<WhitelistConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter & search
  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Add user form
  const [addUserId, setAddUserId] = useState('');
  const [addReason, setAddReason] = useState('');
  const [isPending, startTransition] = useTransition();

  // Leaderboard config
  const [rankThreshold, setRankThreshold] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Import
  const [isImporting, setIsImporting] = useState(false);

  // Remove
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Filtered entries
  // -------------------------------------------------------------------------

  const filteredEntries = useMemo(() => {
    let result = entries;

    if (filterSource !== 'all') {
      result = result.filter((e) => e.source === filterSource);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (e) =>
          e.username?.toLowerCase().includes(q) ||
          e.userId.toLowerCase().includes(q) ||
          e.walletAddress?.toLowerCase().includes(q) ||
          e.displayName?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [entries, filterSource, searchQuery]);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whitelist');
      if (!res.ok) throw new Error('Failed to fetch whitelist');
      const data = await res.json();
      setEntries(data.entries ?? []);
      setStats(data.stats ?? null);
    } catch (err) {
      toast.error('Failed to load whitelist data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whitelist/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      const data = await res.json();
      const cfg = data.config ?? null;
      setConfig(cfg);
      setRankThreshold(
        cfg?.leaderboardRankThreshold != null
          ? String(cfg.leaderboardRankThreshold)
          : ''
      );
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchConfig();
  }, [fetchEntries, fetchConfig]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  function handleAddUser() {
    if (!addUserId.trim()) return;

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/whitelist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: addUserId.trim(),
            source: 'admin_manual',
            reason: addReason.trim() || undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error ?? 'Failed to add user');
          return;
        }

        toast.success(`User ${data.username ?? addUserId.trim()} whitelisted`);
        setAddUserId('');
        setAddReason('');
        await fetchEntries();
      } catch {
        toast.error('Failed to add user');
      }
    });
  }

  async function handleRemoveUser(userId: string) {
    const entry = entries.find((e) => e.userId === userId);
    const label = entry?.displayName ?? entry?.username ?? userId.slice(0, 12);
    if (
      !window.confirm(
        `Revoke whitelist access for "${label}"? They will be subject to NFT gating again.`
      )
    )
      return;

    setRemovingUserId(userId);
    try {
      const res = await fetch('/api/admin/whitelist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to remove user');
        return;
      }

      toast.success('User removed from whitelist');
      await fetchEntries();
    } catch {
      toast.error('Failed to remove user');
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleSaveConfig() {
    setIsSavingConfig(true);
    try {
      const threshold = rankThreshold.trim()
        ? Number.parseInt(rankThreshold.trim(), 10)
        : null;

      if (threshold !== null && (Number.isNaN(threshold) || threshold < 0)) {
        toast.error('Rank threshold must be a non-negative number or empty');
        return;
      }

      const res = await fetch('/api/admin/whitelist/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardRankThreshold: threshold }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to save config');
        return;
      }

      toast.success(
        threshold !== null
          ? `Leaderboard whitelist enabled for top ${threshold} users`
          : 'Leaderboard whitelist disabled'
      );
      setConfig(data.config ?? null);
    } catch {
      toast.error('Failed to save config');
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function handleImportFirst100() {
    if (
      !window.confirm(
        'Import all users from the NFT snapshot as whitelisted? This is a bulk operation and cannot be easily undone.'
      )
    )
      return;

    setIsImporting(true);
    try {
      const res = await fetch('/api/admin/whitelist/import-first-100', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to import');
        return;
      }

      toast.success(
        `Imported ${data.imported ?? 0} users, ${data.skipped ?? 0} skipped`
      );
      await fetchEntries();
    } catch {
      toast.error('Failed to import first 100');
    } finally {
      setIsImporting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function sourceLabel(source: WhitelistSource) {
    switch (source) {
      case 'snapshot_first_100':
        return 'First 100';
      case 'admin_manual':
        return 'Admin';
      case 'leaderboard':
        return 'Leaderboard';
    }
  }

  function sourceBadgeClasses(source: WhitelistSource) {
    switch (source) {
      case 'snapshot_first_100':
        return 'bg-blue-500/10 text-blue-500';
      case 'admin_manual':
        return 'bg-purple-500/10 text-purple-500';
      case 'leaderboard':
        return 'bg-amber-500/10 text-amber-500';
    }
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Shield className="h-4 w-4" />
              Total Whitelisted
            </div>
            <p className="mt-1 font-bold text-2xl">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Trophy className="h-4 w-4" />
              First 100
            </div>
            <p className="mt-1 font-bold text-2xl">
              {stats.snapshot_first_100}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Leaderboard
            </div>
            <p className="mt-1 font-bold text-2xl">
              {config?.leaderboardRankThreshold != null
                ? `Top ${config.leaderboardRankThreshold}`
                : 'Disabled'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <UserPlus className="h-4 w-4" />
              Admin Manual
            </div>
            <p className="mt-1 font-bold text-2xl">{stats.admin_manual}</p>
          </div>
        </div>
      )}

      {/* Leaderboard Config Section */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 font-medium text-sm">
          <Settings className="h-4 w-4 text-muted-foreground" />
          Leaderboard Whitelist Configuration
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-muted-foreground text-xs">
              Rank Threshold (users ranked 1 to N are whitelisted)
            </label>
            <input
              type="number"
              min="0"
              value={rankThreshold}
              onChange={(e) => setRankThreshold(e.target.value)}
              placeholder="e.g. 500 (leave empty to disable)"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleSaveConfig}
            disabled={isSavingConfig}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors',
              'hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {isSavingConfig ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
        <p className="mt-2 text-muted-foreground text-xs">
          When set, any user ranked within this threshold on the leaderboard
          automatically bypasses gating. This is dynamic and updates as rankings
          change.
        </p>
      </div>

      {/* Import + Add User Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Add User Form */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddUser();
              }}
              placeholder="User ID to whitelist..."
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddUser();
              }}
              placeholder="Reason (optional)"
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleAddUser}
              disabled={isPending || !addUserId.trim()}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 font-medium text-primary-foreground text-sm transition-colors',
                'hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </button>
          </div>
        </div>

        {/* Import Button */}
        <button
          onClick={handleImportFirst100}
          disabled={isImporting}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 font-medium text-sm transition-colors',
            'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {isImporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Import First 100 from Snapshot
        </button>
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'snapshot_first_100', label: 'First 100' },
              { key: 'leaderboard', label: 'Leaderboard' },
              { key: 'admin_manual', label: 'Admin' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterSource(key)}
              className={cn(
                'rounded-lg px-3 py-1.5 font-medium text-sm transition-colors',
                filterSource === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by user, ID, or wallet..."
            className="h-9 rounded-lg border border-border bg-background pr-3 pl-9 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-border border-b bg-muted/50">
              <th className="px-4 py-3 font-medium text-muted-foreground">
                User
              </th>
              <th className="px-4 py-3 font-medium text-muted-foreground">
                Source
              </th>
              <th className="px-4 py-3 font-medium text-muted-foreground">
                Reason
              </th>
              <th className="px-4 py-3 font-medium text-muted-foreground">
                Granted At
              </th>
              <th className="px-4 py-3 font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {entries.length === 0
                    ? 'No whitelist entries yet. Add users manually or import from snapshot.'
                    : 'No entries match your search/filter.'}
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-border border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium">
                        {entry.displayName ?? entry.username ?? 'Unknown'}
                      </span>
                      {entry.username && entry.displayName && (
                        <span className="ml-1 text-muted-foreground text-xs">
                          @{entry.username}
                        </span>
                      )}
                      <div className="text-muted-foreground text-xs">
                        {entry.userId.slice(0, 12)}...
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs',
                        sourceBadgeClasses(entry.source)
                      )}
                    >
                      {sourceLabel(entry.source)}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground text-xs">
                    {entry.reason ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(entry.grantedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {entry.revokedAt ? (
                      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 font-medium text-red-500 text-xs">
                        Revoked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 font-medium text-green-500 text-xs">
                        <CheckCircle className="h-3 w-3" />
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!entry.revokedAt && (
                      <button
                        onClick={() => handleRemoveUser(entry.userId)}
                        disabled={removingUserId === entry.userId}
                        title="Revoke whitelist access"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-500/10"
                      >
                        {removingUserId === entry.userId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Count footer */}
      <div className="text-muted-foreground text-xs">
        Showing {filteredEntries.length} of {entries.length} entries
      </div>
    </div>
  );
}
