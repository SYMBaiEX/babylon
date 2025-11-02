'use client'

import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { Dropdown, DropdownItem } from '@/components/shared/Dropdown'
import { User as UserIcon, LogOut } from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/shared/Avatar'

export function UserMenu() {
  const { logout } = useAuth()
  const { user } = useAuthStore()

  if (!user) {
    return null
  }

  const trigger = (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent cursor-pointer transition-colors border border-transparent hover:border-border">
      <Avatar id={user.id} name={user.displayName || 'Anonymous'} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">
          {user.displayName || 'Anonymous'}
        </p>
      </div>
    </div>
  )

  return (
    <Dropdown trigger={trigger}>
      <Link href="/profile">
        <DropdownItem>
          <div className="flex items-center gap-2">
            <UserIcon className="w-4 h-4" />
            <span>My Profile</span>
          </div>
        </DropdownItem>
      </Link>
      <DropdownItem onClick={logout}>
        <div className="flex items-center gap-2 text-destructive">
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </div>
      </DropdownItem>
    </Dropdown>
  )
}
