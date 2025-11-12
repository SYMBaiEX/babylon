import { type PortfolioPnLSnapshot } from '@/hooks/usePortfolioPnL'
import { RefreshCcw, Share2, Sparkles } from 'lucide-react'

interface PortfolioPnLCardProps {
  data: PortfolioPnLSnapshot | null
  loading: boolean
  error: string | null
  onShare: () => void
  onRefresh: () => void | Promise<void>
  lastUpdated: number | null
  setShowBuyPointsModal: (show: boolean) => void
}

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function formatCurrency(value: number | null | undefined) {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return formatter.format(safeValue)
}

function formatRelativeTime(timestamp: number | null) {
  if (!timestamp) return ''
  const diffMs = Date.now() - timestamp
  if (diffMs < 0) return ''
  const diffMinutes = Math.round(diffMs / (1000 * 60))
  if (diffMinutes <= 1) return 'Updated just now'
  if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `Updated ${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  return `Updated ${diffDays}d ago`
}

export function PortfolioPnLCard({
  data,
  loading,
  error,
  onShare,
  onRefresh,
  lastUpdated,
  setShowBuyPointsModal
}: PortfolioPnLCardProps) {
  return (
    <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-purple-500/10 to-primary/5 px-4 py-3 sm:px-5 sm:py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your Portfolio
          </h2>
          <p className="text-xs text-muted-foreground">
            {formatRelativeTime(lastUpdated)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center justify-center rounded-lg border border-white/10 bg-white/10 p-2 text-white backdrop-blur transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Refresh portfolio P&L"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onShare}
            disabled={loading || !data}
            className="inline-flex items-center gap-3 rounded-lg bg-white/90 px-3 py-3 text-sm font-semibold text-[#0B1C3D] shadow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Share2 className="h-4 w-4" />
            Share P&amp;L
          </button>
          <button
            onClick={() => setShowBuyPointsModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-600 text-white font-medium rounded-lg hover:from-yellow-600 hover:to-amber-700 transition-all shadow-md hover:shadow-lg"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Buy Points</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="h-20 animate-pulse rounded-lg bg-white/20" />
          <div className="h-20 animate-pulse rounded-lg bg-white/20" />
        </div>
      ) : error ? (
        <div className="mt-6 rounded-lg bg-white/10 px-4 py-3 text-sm text-white/80">
          <p className="font-medium text-white">Unable to load portfolio</p>
          <p className="mt-1 text-white/80">{error}</p>
        </div>
      ) : (
        data && (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/10 p-4 backdrop-blur">
              <dt className="text-xs uppercase text-white/70">Total Points</dt>
              <dd className="mt-2 text-3xl font-bold text-white">
                {formatCurrency(data.accountEquity)}
              </dd>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/10 p-4 backdrop-blur">
              <dt className="text-xs uppercase text-white/70">Available to Invest</dt>
              <dd className="mt-2 text-3xl font-bold text-white">
                {formatCurrency(data.availableBalance)}
              </dd>
            </div>
          </div>
        )
      )}
    </section>
  )
}

