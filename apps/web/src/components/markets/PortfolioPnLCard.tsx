import { Share2, Sparkles } from 'lucide-react';
import type { PortfolioBreakdownSnapshot } from '@/hooks/usePortfolioPnL';

/**
 * Portfolio action bar component for the Markets dashboard.
 *
 * Provides quick actions for sharing P&L and buying points.
 * Balance information is now displayed in the header, so this component
 * focuses on actions only.
 *
 * Features:
 * - Share P&L functionality
 * - Buy points button
 * - Loading states
 *
 * @param props - PortfolioPnLCard component props
 * @returns Portfolio action bar element
 *
 * @example
 * ```tsx
 * <PortfolioPnLCard
 *   data={portfolioData}
 *   loading={false}
 *   onShare={() => sharePortfolio()}
 *   setShowBuyPointsModal={setShowBuyPoints}
 * />
 * ```
 */
interface PortfolioPnLCardProps {
  data: PortfolioBreakdownSnapshot | null;
  loading: boolean;
  error: string | null;
  onShare: () => void;
  setShowBuyPointsModal: (show: boolean) => void;
}

export function PortfolioPnLCard({
  data,
  loading,
  onShare,
  setShowBuyPointsModal,
}: PortfolioPnLCardProps) {
  return (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onShare}
        disabled={loading || !data}
        className="inline-flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2.5 font-semibold text-[#0B1C3D] text-sm shadow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Share2 className="h-4 w-4" />
        Share P&amp;L
      </button>
      <button
        type="button"
        onClick={() => setShowBuyPointsModal(true)}
        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-yellow-500 to-amber-600 px-4 py-2.5 font-medium text-primary-foreground shadow-md transition-all hover:from-yellow-600 hover:to-amber-700 hover:shadow-lg"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Buy Points</span>
      </button>
    </div>
  );
}
