import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/shared/Sidebar'
import { MobileHeader } from '@/components/shared/MobileHeader'
import { BottomNav } from '@/components/shared/BottomNav'
import { Providers } from '@/components/providers/Providers'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'Babylon - Prediction Market Game',
  description: 'A Twitter-style prediction market game with autonomous actors',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
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
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased bg-sidebar font-sans" suppressHydrationWarning>
        <Providers>
          <Toaster position="top-center" richColors closeButton />

          {/* Mobile Header */}
          <MobileHeader />

          <div className="flex min-h-screen">
            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <main className="flex-1 min-h-screen pt-16 pb-20 md:pt-0 md:pb-0 transition-all duration-300 bg-background md:bg-sidebar">
              <div className="md:p-3 lg:p-4">
                {children}
              </div>
            </main>

            {/* Mobile Bottom Navigation */}
            <BottomNav />
          </div>
        </Providers>
      </body>
    </html>
  )
}
