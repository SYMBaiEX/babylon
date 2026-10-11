import { FeedFullLogo } from '@/components/shared/icons/FeedLogo';
import { formatCurrencyDisplay } from '@/lib/format';
import { getUserDisplayName, getUserHandle } from '@/lib/user-display';
import type { User } from '@/stores/authStore';
import type { MarketCategory } from '@/types/markets';

/**
 * Category PnL data structure for category PnL share card.
 */
interface CategoryPnLData {
  unrealizedPnL: number;
  positionCount: number;
  totalValue?: number;
  categorySpecific?: {
    openInterest?: number;
    totalShares?: number;
    totalInvested?: number;
  };
}

/**
 * Category PnL share card component for generating shareable images.
 *
 * Generates a styled card image (1200x630) for sharing category PnL
 * on social media. Includes user profile, category information, and
 * PnL metrics. Designed for Twitter/Farcaster OG images.
 *
 * Features:
 * - Shareable image generation
 * - Category-specific styling
 * - User profile display
 * - PnL metrics display
 * - Gradient backgrounds
 *
 * @param props - CategoryPnLShareCard component props
 * @returns Category PnL share card element
 *
 * @example
 * ```tsx
 * <CategoryPnLShareCard
 *   category="perps"
 *   data={pnlData}
 *   user={userData}
 * />
 * ```
 */
interface CategoryPnLShareCardProps {
  category: MarketCategory;
  data: CategoryPnLData;
  user: User;
  className?: string;
}

/**
 * Category configuration for styling share cards.
 */
const categoryConfig = {
  perps: {
    title: 'Perpetual Futures',
    emoji: '📈',
    gradient:
      'radial-gradient(circle at top left, rgba(16, 185, 129, 0.85), rgba(10, 10, 30, 0.95)), linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(0, 102, 255, 0.35))',
  },
  predictions: {
    title: 'Prediction Markets',
    emoji: '🔮',
    gradient:
      'radial-gradient(circle at top left, rgba(168, 85, 247, 0.85), rgba(10, 10, 30, 0.95)), linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(0, 102, 255, 0.35))',
  },
  pools: {
    title: 'Trading Pools',
    emoji: '💰',
    gradient:
      'radial-gradient(circle at top left, rgba(249, 115, 22, 0.85), rgba(10, 10, 30, 0.95)), linear-gradient(135deg, rgba(249, 115, 22, 0.3), rgba(0, 102, 255, 0.35))',
  },
};

export function CategoryPnLShareCard({
  category,
  data,
  user,
  className,
}: CategoryPnLShareCardProps) {
  const config = categoryConfig[category];
  const displayName = getUserDisplayName(user, 'Feed Trader');
  const handle = getUserHandle(user, 'anon');

  return (
    <div
      className={className}
      style={{
        width: 1200,
        height: 630,
        borderRadius: 32,
        background: config.gradient,
        color: '#F8FAFC',
        padding: '48px 64px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontFamily: 'Inter, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          right: '-10%',
          width: '480px',
          height: '480px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%)',
        }}
      />

      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '3px solid rgba(255,255,255,0.25)',
              position: 'relative',
            }}
          >
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={displayName}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(135deg, #0F1729, #172554)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  fontWeight: 700,
                }}
              >
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              {displayName}
            </p>
            <p
              style={{
                fontSize: 18,
                color: 'rgba(226, 232, 255, 0.7)',
                marginTop: 2,
              }}
            >
              @{handle}
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FeedFullLogo width={180} height={55} style={{ color: 'white' }} />
        </div>
      </header>

      <main
        style={{
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '8px',
          }}
        >
          <span style={{ fontSize: 40 }}>{config.emoji}</span>
          <p
            style={{
              fontSize: 20,
              textTransform: 'uppercase',
              letterSpacing: '0.25em',
              color: 'rgba(226, 232, 255, 0.65)',
              fontWeight: 500,
            }}
          >
            {config.title}
          </p>
        </div>
        <p
          style={{
            marginTop: 12,
            fontSize: 120,
            fontWeight: 700,
            lineHeight: 1,
            color: data.unrealizedPnL >= 0 ? '#34D399' : '#F87171',
          }}
        >
          {data.unrealizedPnL >= 0 ? '+' : ''}
          {formatCurrencyDisplay(data.unrealizedPnL)}
        </p>

        <div
          style={{
            marginTop: 32,
            display: 'flex',
            gap: 48,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <MiniStat
            title="Open Positions"
            value={data.positionCount.toString()}
          />
          {data.totalValue !== undefined && (
            <MiniStat
              title="Total Value"
              value={formatCurrencyDisplay(data.totalValue)}
            />
          )}
        </div>
      </main>

      <footer
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1,
        }}
      >
        <p
          style={{
            fontSize: 18,
            color: 'rgba(226, 232, 255, 0.6)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Trade the narrative. Share the upside.
        </p>
      </footer>
    </div>
  );
}

interface MiniStatProps {
  title: string;
  value: string;
}

function MiniStat({ title, value }: MiniStatProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <p
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: 'rgba(226, 232, 255, 0.6)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: '#F8FAFC',
        }}
      >
        {value}
      </p>
    </div>
  );
}
