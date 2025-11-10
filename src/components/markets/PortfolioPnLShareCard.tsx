import type { PortfolioPnLSnapshot } from '@/hooks/usePortfolioPnL'
import type { User } from '@/stores/authStore'
import { BouncingLogo } from '@/components/shared/BouncingLogo'
import Image from 'next/image'

interface PortfolioPnLShareCardProps {
  data: PortfolioPnLSnapshot
  user: User
  timestamp: Date
  className?: string
}

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function formatCurrency(value: number) {
  return formatter.format(Number.isFinite(value) ? value : 0)
}

export function PortfolioPnLShareCard({ data, user, timestamp, className }: PortfolioPnLShareCardProps) {
  const displayName = user.displayName || 'Babylon Trader'
  const handle =
    user.username || user.farcasterUsername || user.twitterUsername || user.walletAddress || 'anon'
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)

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
        padding: '64px',
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
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%)',
        }}
      />

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '4px solid rgba(255,255,255,0.25)',
              position: 'relative',
            }}
          >
            {user.profileImageUrl ? (
              <Image
                src={user.profileImageUrl}
                alt={displayName}
                fill
                sizes="96px"
                style={{ objectFit: 'cover' }}
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
                  fontSize: 32,
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
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              {displayName}
            </p>
            <p
              style={{
                fontSize: 20,
                color: 'rgba(226, 232, 255, 0.75)',
                marginTop: 4,
              }}
            >
              @{handle}
            </p>
            <p
              style={{
                marginTop: 12,
                fontSize: 18,
                color: 'rgba(226, 232, 255, 0.65)',
              }}
            >
              {formattedDate}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: 'rgba(226, 232, 255, 0.75)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            Babylon
          </span>
          <div style={{ width: 72, height: 72 }}>
            <BouncingLogo size={72} />
          </div>
        </div>
      </header>

      <main>
        <p
          style={{
            fontSize: 22,
            textTransform: 'uppercase',
            letterSpacing: '0.25em',
            color: 'rgba(226, 232, 255, 0.65)',
          }}
        >
          Total Performance
        </p>
        <p
          style={{
            marginTop: 16,
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.05,
            color: data.totalPnL >= 0 ? '#34D399' : '#F87171',
          }}
        >
          {data.totalPnL >= 0 ? '+' : ''}
          {formatCurrency(data.totalPnL)}
        </p>

        <div
          style={{
            marginTop: 48,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 24,
          }}
        >
          <Stat title="Net Contributions" value={formatCurrency(data.netContributions)} />
          <Stat title="Account Equity" value={formatCurrency(data.accountEquity)} />
          <Stat title="Available Cash" value={formatCurrency(data.availableBalance)} />
        </div>
      </main>

      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 48,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 24,
          }}
        >
          <Stat
            title="Perps Unrealized P&L"
            value={formatCurrency(data.unrealizedPerpPnL)}
            align="start"
            small
          />
          <Stat
            title="Predictions Unrealized P&L"
            value={formatCurrency(data.unrealizedPredictionPnL)}
            align="start"
            small
          />
        </div>

        <p
          style={{
            fontSize: 20,
            color: 'rgba(226, 232, 255, 0.65)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Trade the narrative. Share the upside.
        </p>
      </footer>
    </div>
  )
}

interface StatProps {
  title: string
  value: string
  align?: 'start' | 'center' | 'end'
  small?: boolean
}

function Stat({ title, value, align = 'center', small = false }: StatProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems:
          align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(30, 64, 175, 0.25))',
        borderRadius: 20,
        padding: '24px 28px',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        backdropFilter: 'blur(12px)',
        minHeight: small ? 120 : 160,
        justifyContent: 'center',
      }}
    >
      <p
        style={{
          fontSize: small ? 18 : 20,
          fontWeight: 500,
          color: 'rgba(226, 232, 255, 0.7)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {title}
      </p>
      <p
        style={{
          marginTop: small ? 12 : 16,
          fontSize: small ? 32 : 40,
          fontWeight: 700,
          color: '#F8FAFC',
        }}
      >
        {value}
      </p>
    </div>
  )
}

