'use client'

import { Type, Bell, Lock, Palette, Globe } from 'lucide-react'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { FontSizePresets } from '@/components/shared/FontSizePresets'
import { PageContainer } from '@/components/shared/PageContainer'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto pb-24 md:pb-4">
        <div className="max-w-2xl mx-auto p-3 md:p-4 space-y-4 md:space-y-6">
          {/* Accessibility Section */}
          <section className="bg-sidebar-accent rounded-xl p-4 md:p-6 border border-border">
            <div className="flex items-center gap-2 mb-4 md:mb-6">
              <Type className="w-5 h-5" style={{ color: '#1c9cf0' }} />
              <h2 className="text-base md:text-lg font-semibold" style={{ color: '#1c9cf0' }}>
                Accessibility
              </h2>
            </div>

            <div className="space-y-4 md:space-y-6">
              <div>
                <label className="text-sm font-medium text-foreground mb-3 block">
                  Feed Content Size
                </label>
                <FontSizePresets />
              </div>
            </div>
          </section>

          {/* Appearance Section */}
          <section className="bg-sidebar-accent rounded-xl p-4 md:p-6 border border-border">
            <div className="flex items-center gap-2 mb-4 md:mb-6">
              <Palette className="w-5 h-5" style={{ color: '#1c9cf0' }} />
              <h2 className="text-base md:text-lg font-semibold" style={{ color: '#1c9cf0' }}>
                Appearance
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Theme
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Choose your interface color scheme
                  </p>
                </div>
                <div className="flex justify-end sm:justify-start">
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </section>

          {/* Notifications Section */}
          <section className="bg-sidebar-accent rounded-xl p-4 md:p-6 border border-border">
            <div className="flex items-center gap-2 mb-4 md:mb-6">
              <Bell className="w-5 h-5" style={{ color: '#1c9cf0' }} />
              <h2 className="text-base md:text-lg font-semibold" style={{ color: '#1c9cf0' }}>
                Notifications
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 py-2 md:py-3 border-b border-border">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Push Notifications
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Receive notifications about your predictions
                  </p>
                </div>
                <button
                  className={cn(
                    'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
                    'bg-muted'
                  )}
                >
                  <span className="inline-block h-4 w-4 transform rounded-full bg-background transition translate-x-1" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 py-2 md:py-3">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Email Notifications
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Get updates via email
                  </p>
                </div>
                <button
                  className={cn(
                    'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
                    'bg-muted'
                  )}
                >
                  <span className="inline-block h-4 w-4 transform rounded-full bg-background transition translate-x-1" />
                </button>
              </div>
            </div>
          </section>

          {/* Privacy Section */}
          <section className="bg-sidebar-accent rounded-xl p-4 md:p-6 border border-border">
            <div className="flex items-center gap-2 mb-4 md:mb-6">
              <Lock className="w-5 h-5" style={{ color: '#1c9cf0' }} />
              <h2 className="text-base md:text-lg font-semibold" style={{ color: '#1c9cf0' }}>
                Privacy & Security
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-2 md:py-3 border-b border-border">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Profile Visibility
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Who can see your profile and predictions
                  </p>
                </div>
                <select className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground w-full sm:w-auto">
                  <option>Public</option>
                  <option>Private</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-4 py-2 md:py-3">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium text-foreground block mb-1">
                    Activity Status
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Show when you're active
                  </p>
                </div>
                <button
                  className={cn(
                    'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
                    'bg-muted'
                  )}
                >
                  <span className="inline-block h-4 w-4 transform rounded-full bg-background transition translate-x-1" />
                </button>
              </div>
            </div>
          </section>

          {/* Language Section */}
          <section className="bg-sidebar-accent rounded-xl p-4 md:p-6 border border-border">
            <div className="flex items-center gap-2 mb-4 md:mb-6">
              <Globe className="w-5 h-5" style={{ color: '#1c9cf0' }} />
              <h2 className="text-base md:text-lg font-semibold" style={{ color: '#1c9cf0' }}>
                Language & Region
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Display Language
                </label>
                <select className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground">
                  <option>English</option>
                  <option>Español</option>
                  <option>Français</option>
                  <option>Deutsch</option>
                  <option>日本語</option>
                </select>
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  )
}
