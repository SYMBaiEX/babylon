'use client'

import { cn, sanitizeId } from '@/lib/utils'
import { useState } from 'react'

interface AvatarProps {
  id: string
  name: string
  type?: 'actor' | 'business'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  scaleFactor?: number
}

interface GroupAvatarProps {
  members: Array<{ id: string; name: string; type?: 'actor' | 'business' }>
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
}

export function Avatar({ id, name, type = 'actor', size = 'md', className, scaleFactor = 1 }: AvatarProps) {
  const [imageError, setImageError] = useState(false)
  const sanitizedId = sanitizeId(id)
  const imagePath = type === 'business'
    ? `/images/organizations/${sanitizedId}.jpg`
    : `/images/actors/${sanitizedId}.jpg`

  // Base sizes in rem
  const baseSizes = {
    sm: 2,    // 32px
    md: 2.5,  // 40px
    lg: 3.5,  // 56px
  }

  const scaledSize = baseSizes[size] * scaleFactor

  return (
    <div
      className={cn(
        'rounded-lg bg-primary/20 flex items-center justify-center overflow-hidden',
        className
      )}
      style={{
        width: `${scaledSize}rem`,
        height: `${scaledSize}rem`,
        fontSize: `${scaleFactor}rem`
      }}
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
          {name ? name.charAt(0).toUpperCase() : id ? id.charAt(0).toUpperCase() : '?'}
        </div>
      )}
    </div>
  )
}

export function GroupAvatar({ members, size = 'md', className }: GroupAvatarProps) {
  // Show up to 3 members in overlapping squares
  const displayMembers = members.slice(0, 3)

  if (displayMembers.length === 0) {
    return (
      <div className={cn(
        'rounded-lg bg-primary/20 flex items-center justify-center',
        sizeClasses[size],
        className
      )}>
        <div className="text-primary font-bold">G</div>
      </div>
    )
  }

  if (displayMembers.length === 1) {
    const member = displayMembers[0]!;
    return <Avatar id={member.id} name={member.name} type={member.type} size={size} className={className} />
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
            'absolute rounded-lg bg-primary/20 flex items-center justify-center overflow-hidden border-2 border-background',
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
