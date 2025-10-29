'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, PlayCircle, TrendingUp, MessageCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useEffect, useRef } from 'react'

export function BottomNav() {
  const pathname = usePathname()
  const { isMobileMenuOpen, closeMobileMenu, openMobileMenu } = useUIStore()
  const touchStartY = useRef<number>(0)
  const touchEndY = useRef<number>(0)
  const minSwipeDistance = 80

  // Handle swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.targetTouches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndY.current = e.targetTouches[0].clientY
  }

  const handleTouchEnd = () => {
    if (!touchStartY.current || !touchEndY.current) return
    
    const distance = touchStartY.current - touchEndY.current
    const isUpSwipe = distance > minSwipeDistance
    const isDownSwipe = distance < -minSwipeDistance

    if (isUpSwipe && !isMobileMenuOpen) {
      // Swipe up to open menu
      openMobileMenu()
    } else if (isDownSwipe && isMobileMenuOpen) {
      // Swipe down to close menu
      closeMobileMenu()
    }
  }

  // Add touch event listeners only to the bottom area of the screen
  useEffect(() => {
    const mainContent = document.querySelector('main')
    if (!mainContent) return

    const handleMainTouchStart = (e: TouchEvent) => {
      const touchY = e.touches[0].clientY
      const screenHeight = window.innerHeight
      
      // Only track touches in the bottom 20% of the screen
      if (touchY > screenHeight * 0.8) {
        touchStartY.current = touchY
      } else {
        touchStartY.current = 0
      }
    }

    const handleMainTouchMove = (e: TouchEvent) => {
      if (touchStartY.current > 0) {
        touchEndY.current = e.touches[0].clientY
      }
    }

    const handleMainTouchEnd = () => {
      if (!touchStartY.current || !touchEndY.current || touchStartY.current === 0) return
      
      const distance = touchStartY.current - touchEndY.current
      const isUpSwipe = distance > minSwipeDistance
      const isDownSwipe = distance < -minSwipeDistance

      if (isUpSwipe && !isMobileMenuOpen) {
        // Swipe up to open menu
        openMobileMenu()
      } else if (isDownSwipe && isMobileMenuOpen) {
        // Swipe down to close menu
        closeMobileMenu()
      }
      
      // Reset values
      touchStartY.current = 0
      touchEndY.current = 0
    }

    mainContent.addEventListener('touchstart', handleMainTouchStart, { passive: true })
    mainContent.addEventListener('touchmove', handleMainTouchMove, { passive: true })
    mainContent.addEventListener('touchend', handleMainTouchEnd, { passive: true })

    return () => {
      mainContent.removeEventListener('touchstart', handleMainTouchStart)
      mainContent.removeEventListener('touchmove', handleMainTouchMove)
      mainContent.removeEventListener('touchend', handleMainTouchEnd)
    }
  }, [isMobileMenuOpen, openMobileMenu, closeMobileMenu])

  const navItems = [
    {
      name: 'Feed',
      href: '/feed',
      icon: Home,
      color: '#1c9cf0', // Blue
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Game',
      href: '/game',
      icon: PlayCircle,
      color: '#10b981', // Emerald
      active: pathname === '/game',
    },
    {
      name: 'Markets',
      href: '/markets',
      icon: TrendingUp,
      color: '#f59e0b', // Amber
      active: pathname === '/markets',
    },
    {
      name: 'Chats',
      href: '/chats',
      icon: MessageCircle,
      color: '#b82323', // Red
      active: pathname === '/chats',
    },
    {
      name: 'Profile',
      href: '/profile',
      icon: User,
      color: '#8b5cf6', // Purple
      active: pathname === '/profile' || pathname?.startsWith('/profile/'),
    },
  ]

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          .neumorphic-nav-container {
            box-shadow: 10px 10px 20px rgba(0, 0, 0, 0.15), -10px -10px 20px rgba(255, 255, 255, 0.05);
          }

          .neumorphic-nav-button {
            box-shadow: inset 5px 5px 5px rgba(0, 0, 0, 0.1), inset -5px -5px 5px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .neumorphic-nav-button:hover {
            box-shadow: none;
          }
        `
      }} />
      
      {/* Swipe indicator when menu is closed */}
      {!isMobileMenuOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden pointer-events-none">
          {/* Swipe area indicator */}
          <div className="h-20 bg-gradient-to-t from-background/20 to-transparent"></div>
          {/* Swipe hint */}
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
            <div className="flex flex-col items-center space-y-1 animate-pulse">
              <div className="w-8 h-1 bg-muted-foreground/30 rounded-full"></div>
              <div className="text-xs text-muted-foreground/60">Swipe up</div>
            </div>
          </div>
        </div>
      )}

      {/* Only render when menu is open */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 md:hidden bg-background/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={closeMobileMenu}
          />

          <nav className="fixed left-4 right-4 bottom-6 z-50 md:hidden bg-sidebar/95 backdrop-blur-md neumorphic-nav-container rounded-2xl p-1 animate-in slide-in-from-bottom duration-300">
            {/* Navigation Items */}
            <div className="flex justify-around items-center">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'neumorphic-nav-button flex items-center justify-center w-14 h-14 m-1 rounded-xl cursor-pointer',
                      'transition-all duration-300',
                      !item.active && 'bg-sidebar-accent/30'
                    )}
                    aria-label={item.name}
                    style={{
                      backgroundColor: item.active ? item.color : undefined,
                    }}
                    onClick={closeMobileMenu}
                    onMouseEnter={(e) => {
                      if (!item.active) {
                        e.currentTarget.style.backgroundColor = item.color
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!item.active) {
                        e.currentTarget.style.backgroundColor = ''
                      }
                    }}
                  >
                    {/* Icon */}
                    <Icon
                      className={cn(
                        'w-6 h-6 transition-colors duration-300',
                        !item.active && 'text-sidebar-foreground'
                      )}
                      style={{
                        color: item.active ? '#e4e4e4' : undefined,
                      }}
                      onMouseEnter={(e) => {
                        if (!item.active) {
                          e.currentTarget.style.color = '#e4e4e4'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!item.active) {
                          e.currentTarget.style.color = ''
                        }
                      }}
                    />
                  </Link>
                )
              })}
            </div>
          </nav>
        </>
      )}
    </>
  )
}
