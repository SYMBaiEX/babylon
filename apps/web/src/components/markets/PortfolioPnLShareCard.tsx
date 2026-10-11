import { FeedFullLogo } from '@/components/shared/icons/FeedLogo';
import type { PortfolioBreakdownSnapshot } from '@/hooks/usePortfolioPnL';
import { formatCurrencyDisplay } from '@/lib/format';
import { getUserDisplayName, getUserHandle } from '@/lib/user-display';
import type { User } from '@/stores/authStore';

/**
 * Portfolio PnL share card component for generating shareable images.
 *
 * Generates a styled card image (1200x630) for sharing portfolio PnL
 * on social media. Includes user profile, portfolio metrics, and
 * PnL breakdown. Designed for Twitter OG images.
 *
 * Features:
 * - Shareable image generation
 * - Portfolio metrics display
 * - User profile display
 * - PnL breakdown
 * - Gradient backgrounds
 *
 * @param props - PortfolioPnLShareCard component props
 * @returns Portfolio PnL share card element
 *
 * @example
 * ```tsx
 * <PortfolioPnLShareCard
 *   data={portfolioData}
 *   user={userData}
 * />
 * ```
 */
interface PortfolioPnLShareCardProps {
  data: PortfolioBreakdownSnapshot;
  user: User;
  className?: string;
}

export function PortfolioPnLShareCard({
  data,
  user,
  className,
}: PortfolioPnLShareCardProps) {
  const displayName = getUserDisplayName(user, 'Feed Trader');
  const handle = getUserHandle(user, 'anon');

  return (
    <div
      className={className}
      style={{
        width: 1200,
        height: 630,
        borderRadius: 32,
        background:
          'radial-gradient(circle at top left, rgba(0, 102, 255, 0.85), rgba(10, 10, 30, 0.95)), linear-gradient(135deg, rgba(25, 15, 60, 0.9), rgba(0, 102, 255, 0.35))',
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
        <p
          style={{
            fontSize: 20,
            textTransform: 'uppercase',
            letterSpacing: '0.25em',
            color: 'rgba(226, 232, 255, 0.65)',
            fontWeight: 500,
          }}
        >
          Total Performance
        </p>
        <p
          style={{
            marginTop: 12,
            fontSize: 120,
            fontWeight: 700,
            lineHeight: 1,
            color: data.totalPnL >= 0 ? '#34D399' : '#F87171',
          }}
        >
          {data.totalPnL >= 0 ? '+' : ''}
          {formatCurrencyDisplay(data.totalPnL)}
        </p>
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
