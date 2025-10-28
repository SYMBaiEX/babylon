'use client'

import { cn } from '@/lib/utils'
import { useState } from 'react'

interface AvatarProps {
  id: string
  name: string
  type?: 'actor' | 'business'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

interface GroupAvatarProps {
  members: Array<{ id: string; name: string; type?: 'actor' | 'business' }>
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
}

export function Avatar({ id, name, type = 'actor', size = 'md', className }: AvatarProps) {
  const [imageError, setImageError] = useState(false)
  const imagePath = type === 'business'
    ? `/images/businesses/${id}.jpg`
    : `/images/actors/${id}.jpg`

  return (
    <div
      className={cn(
        'rounded-full bg-primary/20 flex items-center justify-center overflow-hidden',
        sizeClasses[size],
        className
      )}
    >
      {!imageError ? (
        <img
          src={imagePath}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="text-primary font-bold">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  )
}

export function GroupAvatar({ members, size = 'md', className }: GroupAvatarProps) {
  // Show up to 3 members in overlapping circles
  const displayMembers = members.slice(0, 3)

  if (displayMembers.length === 0) {
    return (
      <div className={cn(
        'rounded-full bg-primary/20 flex items-center justify-center',
        sizeClasses[size],
        className
      )}>
        <div className="text-primary font-bold">G</div>
      </div>
    )
  }

  if (displayMembers.length === 1) {
    return <Avatar {...displayMembers[0]} size={size} className={className} />
  }

  // Overlapping avatars
  const overlappingSizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      {displayMembers.map((member, index) => (
        <div
          key={member.id}
          className={cn(
            'absolute rounded-full bg-primary/20 flex items-center justify-center overflow-hidden border-2 border-background',
            overlappingSizeClasses[size]
          )}
          style={{
            left: `${index * (size === 'sm' ? 12 : size === 'md' ? 16 : 20)}px`,
            zIndex: displayMembers.length - index,
          }}
        >
          <Avatar
            {...member}
            size={size === 'lg' ? 'md' : 'sm'}
            className="w-full h-full border-0"
          />
        </div>
      ))}
      {/* Spacer to prevent content overlap */}
      <div
        className={cn(overlappingSizeClasses[size])}
        style={{
          marginRight: `${(displayMembers.length - 1) * (size === 'sm' ? 12 : size === 'md' ? 16 : 20)}px`
        }}
      />
    </div>
  )
}
