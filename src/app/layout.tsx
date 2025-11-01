import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Sidebar } from '@/components/shared/Sidebar'
import { MobileHeader } from '@/components/shared/MobileHeader'
import { BottomNav } from '@/components/shared/BottomNav'
import { Providers } from '@/components/providers/Providers'

// Auto-start game engines on server
import '@/lib/game-service'
import '@/lib/realtime-singleton'
import { Toaster } from 'sonner'
import { GlobalLoginModal } from '@/components/auth/GlobalLoginModal'
import { FeedAuthBanner } from '@/components/auth/FeedAuthBanner'

export const metadata: Metadata = {
  title: 'Babylon - Prediction Market Game',
  description: 'A Twitter-style prediction market game with autonomous actors',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-sidebar font-sans" suppressHydrationWarning>
        <Providers>
          <Toaster position="top-center" richColors closeButton />
          <GlobalLoginModal />

          {/* Mobile Header */}
          <MobileHeader />

          <div className="flex min-h-screen">
            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Main Content Area - Early 2000s Twitter: Simple boxy layout */}
            <main className="flex-1 min-h-screen pt-14 pb-12 md:pt-0 md:pb-0 bg-background md:bg-sidebar md:h-screen">
              <div className="h-[calc(100vh-3.5rem-3rem)] md:h-full md:p-0">
                {children}
              </div>
            </main>

            {/* Mobile Bottom Navigation */}
            <BottomNav />
          </div>

          {/* Auth Banner - shows on all pages when not authenticated */}
          <FeedAuthBanner />
        </Providers>
      </body>
    </html>
  )
}
