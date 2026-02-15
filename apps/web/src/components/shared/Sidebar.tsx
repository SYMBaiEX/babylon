'use client';

import { cn, getReferralUrl } from '@babylon/shared';
import {
  Bell,
  Check,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Gift,
  LogOut,
  MessageCircle,
  MessageSquarePlus,
  Shield,
  TrendingUp,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LoginButton } from '@/components/auth/LoginButton';
import { UserMenu } from '@/components/auth/UserMenu';
import { Avatar } from '@/components/shared/Avatar';
import { BabylonIcon } from '@/components/shared/icons/BabylonIcon';
import { BabylonFullLogo } from '@/components/shared/icons/BabylonLogo';
import { HouseIcon } from '@/components/shared/icons/HouseIcon';
import { GameFeedbackModal } from '@/components/feedback/GameFeedbackModal';
import { useAuth } from '@/hooks/useAuth';
import { usePostHog } from '@/hooks/usePostHog';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { getAuthToken } from '@/lib/auth';

/**
 * Main sidebar content component with navigation and user menu.
 *
 * Provides navigation links, user authentication state, unread message
 * counts, and admin access. Handles responsive behavior. Includes referral
 * code sharing functionality.
 *
 * @returns Sidebar content element
 */
function SidebarContent() {
  const [collapsed, setCollapsed] = useState(false);
  const [showMdMenu, setShowMdMenu] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const mdMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { ready, authenticated, user, logout, login } = useAuth();
  const { trackNavigation } = usePostHog();
  const { totalUnread: unreadMessages } = useUnreadMessages();

  // Hide sidebar when WAITLIST_MODE is enabled on home page
  const isWaitlistMode = process.env.NEXT_PUBLIC_WAITLIST_MODE === 'true';
  const isHomePage = pathname === '/';
  const shouldHideSidebar = isWaitlistMode && isHomePage;

  // Check if user is admin from the user object
  const isAdmin = user?.isAdmin ?? false;

  // All hooks must be called before any conditional returns
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mdMenuRef.current &&
        !mdMenuRef.current.contains(event.target as Node)
      ) {
        setShowMdMenu(false);
      }
    };

    if (showMdMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [showMdMenu]);

  // Poll for unread notifications
  useEffect(() => {
    if (!authenticated || !user) {
      setUnreadNotifications(0);
      return;
    }

    const fetchUnreadCount = async () => {
      const token = getAuthToken();

      if (!token) {
        return;
      }

      const response = await fetch(
        '/api/notifications?unreadOnly=true&limit=1',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setUnreadNotifications(data.unreadCount || 0);
      }
    };

    fetchUnreadCount();

    // Refresh every 1 minute
    const interval = setInterval(fetchUnreadCount, 60000); // 60 seconds = 1 minute
    return () => clearInterval(interval);
  }, [authenticated, user]);

  // Adjust sidebar height to account for elements above it (e.g. NFT banner)
  // so the user profile bar at the bottom is always visible
  useEffect(() => {
    let rafId: number;
    const updateHeight = () => {
      rafId = requestAnimationFrame(() => {
        if (!asideRef.current) return;
        const top = Math.max(0, asideRef.current.getBoundingClientRect().top);
        asideRef.current.style.height = `calc(100vh - ${top}px)`;
      });
    };
    updateHeight();
    window.addEventListener('scroll', updateHeight, { passive: true });
    window.addEventListener('resize', updateHeight, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updateHeight);
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  const copyReferralCode = async () => {
    if (!user?.referralCode) return;

    const referralUrl = getReferralUrl(user.referralCode);
    await navigator.clipboard.writeText(referralUrl);
    setCopiedReferral(true);
    setTimeout(() => setCopiedReferral(false), 2000);
  };

  // Render nothing if sidebar should be hidden (after all hooks)
  if (shouldHideSidebar) {
    return null;
  }

  const navItems = [
    {
      name: 'Home',
      href: '/feed',
      icon: HouseIcon,
      active: pathname === '/feed' || pathname === '/',
    },
    {
      name: 'Notifications',
      href: '/notifications',
      icon: Bell,
      active: pathname === '/notifications',
      requiresAuth: true,
    },
    {
      name: 'Leaderboard',
      href: '/leaderboard',
      icon: Trophy,
      active: pathname === '/leaderboard',
    },
    {
      name: 'Terminal',
      href: '/markets',
      icon: TrendingUp,
      active: pathname === '/markets',
    },
    {
      name: 'Chats',
      href: '/chats',
      icon: MessageCircle,
      active: pathname === '/chats',
      requiresAuth: true,
    },
    {
      name: 'Agents',
      href: '/agents/team',
      icon: Users,
      active: pathname === '/agents' || pathname.startsWith('/agents/'),
      requiresAuth: true,
    },
    {
      name: 'Rewards',
      href: '/rewards',
      icon: Gift,
      active: pathname === '/rewards',
      requiresAuth: true,
    },
    {
      name: 'Profile',
      href: '/profile',
      icon: User,
      active: pathname === '/profile' || pathname.startsWith('/u/'),
      requiresAuth: true,
    },
    // Admin link (only shown for admins)
    ...(isAdmin
      ? [
          {
            name: 'Admin',
            href: '/admin',
            icon: Shield,
            active: pathname === '/admin',
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Responsive sidebar: icons only on tablet (md), icons + names on desktop (lg+) */}
      <aside
        ref={asideRef}
        className={cn(
          'sticky top-0 isolate z-40 hidden h-screen md:flex md:flex-col',
          'bg-sidebar',
          'transition-all duration-300',
          'md:w-20',
          !collapsed && 'lg:w-64'
        )}
      >
        {/* Header - Logo & Collapse Toggle */}
        <div
          className={cn(
            'flex items-center justify-center p-6',
            !collapsed && 'lg:justify-start lg:px-4'
          )}
        >
          <Link href="/feed" aria-label="Babylon home">
            {/* Icon-only logo for md (tablet) or collapsed */}
            <BabylonIcon
              className={cn(
                'h-8 w-8 text-sidebar-primary',
                !collapsed && 'lg:hidden'
              )}
            />
            {/* Full logo with text for lg+ (desktop) when expanded */}
            {!collapsed && (
              <BabylonFullLogo className="hidden h-8 w-auto text-sidebar-primary lg:block" />
            )}
          </Link>
          {/* Collapse toggle - only visible on lg+ when expanded */}
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="ml-auto hidden items-center justify-center rounded-md p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-black lg:flex dark:hover:text-white"
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft className="h-6 w-6" />
            </button>
          )}
        </div>
        {/* Expand toggle - only visible on lg+ when collapsed, styled like nav items */}
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="hidden w-full items-center justify-center px-4 py-3 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-black lg:flex dark:hover:text-white"
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="h-6 w-6" />
          </button>
        )}

        {/* Navigation - scrollable when screen is short */}
        <nav className="pointer-events-auto relative z-20 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const hasNotificationBadge =
              (item.name === 'Notifications' && unreadNotifications > 0) ||
              (item.name === 'Chats' && unreadMessages > 0);

            const navContent = (
              <>
                {/* Icon with notification indicator */}
                <div className={cn('relative', !collapsed && 'lg:mr-3')}>
                  <Icon
                    className={cn(
                      'h-6 w-6 flex-shrink-0',
                      item.active
                        ? 'text-sidebar-primary'
                        : 'text-sidebar-foreground'
                    )}
                    fill={item.active ? 'currentColor' : 'none'}
                  />
                  {hasNotificationBadge && (
                    <span className="-top-1 -right-1 absolute h-2 w-2 rounded-full bg-blue-500 ring-2 ring-sidebar" />
                  )}
                </div>

                {/* Label - hidden on tablet (md), shown on desktop (lg+) */}
                <span
                  className={cn(
                    'hidden',
                    !collapsed && 'lg:block',
                    'text-lg transition-colors duration-300',
                    item.active
                      ? 'font-semibold text-black dark:text-white'
                      : 'text-sidebar-foreground group-hover:text-black dark:group-hover:text-white'
                  )}
                >
                  {item.name}
                </span>
              </>
            );

            const sharedClassName = cn(
              'group pointer-events-auto relative z-10 flex items-center px-4 py-3',
              'transition-colors duration-200',
              'md:justify-center',
              !collapsed && 'lg:justify-start',
              'bg-transparent hover:bg-sidebar-accent'
            );

            if (item.requiresAuth && !authenticated) {
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={login}
                  className={cn(sharedClassName, 'w-full')}
                  title={item.name}
                  {...(item.name === 'Agents'
                    ? { 'data-tour': 'sidebar-agents' }
                    : {})}
                >
                  {navContent}
                </button>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                className={sharedClassName}
                title={item.name}
                onClick={() => trackNavigation(item.href, 'sidebar')}
                {...(item.name === 'Agents'
                  ? { 'data-tour': 'sidebar-agents' }
                  : {})}
              >
                {navContent}
              </Link>
            );
          })}
        </nav>

        {/* Feedback Button - only when authenticated */}
        {authenticated && (
          <button
            type="button"
            onClick={() => setFeedbackModalOpen(true)}
            className={cn(
              'group pointer-events-auto relative z-10 flex items-center gap-3 px-4 py-3',
              'transition-colors duration-200',
              'md:justify-center',
              !collapsed && 'lg:justify-start',
              'bg-emerald-500/10 hover:bg-emerald-500/20',
              'dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20'
            )}
            title="Feedback"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
              <MessageSquarePlus className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span
              className={cn(
                'hidden',
                !collapsed && 'lg:block',
                'text-lg transition-colors duration-300',
                'text-emerald-700 group-hover:text-emerald-800 dark:text-emerald-400 dark:group-hover:text-emerald-300'
              )}
            >
              Feedback
            </span>
          </button>
        )}

        {/* Bottom Section - Authentication (Desktop lg+) */}
        <div className={cn('hidden', !collapsed && 'lg:block')}>
          {!ready ? (
            // Skeleton loader while authentication is initializing
            <div className="flex animate-pulse items-center gap-3 p-3">
              <div className="h-10 w-10 rounded-full bg-sidebar-accent/50" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-sidebar-accent/50" />
                <div className="h-3 w-16 rounded bg-sidebar-accent/30" />
              </div>
            </div>
          ) : authenticated ? (
            <UserMenu />
          ) : (
            <LoginButton />
          )}
        </div>

        {/* Bottom Section - User Icon (Tablet md) */}
        {authenticated && user && (
          <div
            className={cn('relative md:block', !collapsed && 'lg:hidden')}
            ref={mdMenuRef}
          >
            {/* User avatar button - styled like nav items */}
            <button
              onClick={() => setShowMdMenu(!showMdMenu)}
              className="flex w-full items-center justify-center px-4 py-3 transition-colors duration-200 hover:bg-sidebar-accent"
              aria-label="Open user menu"
            >
              <Avatar
                id={user.id}
                name={user.displayName || user.email || 'User'}
                type="user"
                size="sm"
                src={user.profileImageUrl || undefined}
                imageUrl={user.profileImageUrl || undefined}
              />
            </button>

            {/* Dropdown Menu - styled like nav items */}
            {showMdMenu && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden bg-sidebar shadow-lg">
                {/* Referral Code */}
                {user.referralCode && (
                  <button
                    onClick={copyReferralCode}
                    className="flex w-full items-center justify-center px-4 py-3 transition-colors duration-200 hover:bg-sidebar-accent"
                    title={copiedReferral ? 'Copied!' : 'Copy Referral Link'}
                    aria-label={
                      copiedReferral ? 'Copied!' : 'Copy Referral Link'
                    }
                  >
                    {copiedReferral ? (
                      <Check className="h-6 w-6 flex-shrink-0 text-green-500" />
                    ) : (
                      <Copy className="h-6 w-6 flex-shrink-0 text-sidebar-foreground" />
                    )}
                  </button>
                )}

                {/* Logout */}
                <button
                  onClick={() => {
                    setShowMdMenu(false);
                    logout();
                  }}
                  className="flex w-full items-center justify-center px-4 py-3 text-destructive transition-colors duration-200 hover:bg-sidebar-accent"
                  title="Logout"
                  aria-label="Logout"
                >
                  <LogOut className="h-6 w-6 flex-shrink-0" />
                </button>
              </div>
            )}
          </div>
        )}

        <GameFeedbackModal
          isOpen={feedbackModalOpen}
          onClose={() => setFeedbackModalOpen(false)}
        />
      </aside>
    </>
  );
}

/**
 * Sidebar component with navigation and user menu.
 *
 * Provides navigation links, user authentication state, unread message
 * counts, and admin access. Automatically hides when WAITLIST_MODE is
 * enabled on home page.
 *
 * @returns Sidebar element or null if hidden
 */
export function Sidebar() {
  return <SidebarContent />;
}
