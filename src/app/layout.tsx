import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Sidebar } from '@/components/shared/Sidebar'
import { MobileHeader } from '@/components/shared/MobileHeader'
import { BottomNav } from '@/components/shared/BottomNav'
import { Providers } from '@/components/providers/Providers'

// Import engine module for API route access (engine started via daemon: bun run daemon)
import '@/lib/engine'
import '@/lib/game-service'
import { Toaster } from 'sonner'
import { GlobalLoginModal } from '@/components/auth/GlobalLoginModal'
import { FeedAuthBanner } from '@/components/auth/FeedAuthBanner'

export const metadata: Metadata = {
  title: 'Babylon - Prediction Market Game',
  description: 'A Twitter-style prediction market game with autonomous actors',
  metadataBase: new URL('https://babylon.market'),
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
  openGraph: {
    title: 'Babylon - Prediction Market Game',
    description: 'A Twitter-style prediction market game with autonomous actors',
    url: 'https://babylon.market',
    siteName: 'Babylon',
    images: [
      {
        url: '/assets/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Babylon Prediction Market',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Babylon - Prediction Market Game',
    description: 'A Twitter-style prediction market game with autonomous actors',
    images: ['/assets/images/og-image.png'],
  },
  other: {
    // Farcaster Mini App metadata
    // Reference: https://miniapps.farcaster.xyz/
    'fc:frame': 'vNext',
    'fc:frame:image': 'https://babylon.market/assets/images/og-image.png',
    'fc:frame:button:1': 'Launch Babylon',
    'fc:frame:button:1:action': 'link',
    'fc:frame:button:1:target': 'https://babylon.market',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Disable viewport scaling and overscroll for better pull-to-refresh control
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className="overscroll-none">
      <body className="antialiased bg-background font-sans overscroll-none" suppressHydrationWarning>
        <Providers>
          <Toaster position="top-center" richColors />
          <GlobalLoginModal />

          {/* Mobile Header - Fixed, not affected by pull-to-refresh */}
          <MobileHeader />

          <div className="flex min-h-screen max-w-screen-xl mx-auto bg-sidebar">
            {/* Desktop Sidebar - Sticky, not affected by pull-to-refresh */}
            <Sidebar />

            {/* Main Content Area - Scrollable content with pull-to-refresh */}
            <main className="flex-1 min-h-screen w-full pt-14 pb-14 md:pt-0 md:pb-0 bg-background overflow-hidden">
              <div className="h-[calc(100vh-7rem)] md:h-auto w-full overflow-y-auto overscroll-contain">
                {children}
              </div>
            </main>

            {/* Mobile Bottom Navigation - Fixed, not affected by pull-to-refresh */}
            <BottomNav />
          </div>

          {/* Auth Banner - shows on all pages when not authenticated */}
          <FeedAuthBanner />
        </Providers>
      </body>
    </html>
  )
}
