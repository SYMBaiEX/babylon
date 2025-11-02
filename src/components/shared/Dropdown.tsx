'use client'

import type { ReactNode } from 'react';
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode
  className?: string
  placement?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'
  width?: 'default' | 'sidebar'
}

export function Dropdown({ trigger, children, className, placement = 'bottom-right', width = 'default' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Determine position classes based on placement
  const positionClasses = {
    'top-right': 'bottom-full right-0 mb-2',
    'bottom-right': 'top-full right-0 mt-2',
    'top-left': 'bottom-full left-0 mb-2',
    'bottom-left': 'top-full left-0 mt-2',
  }[placement]

  // Determine animation based on placement
  const animationProps = placement.startsWith('top')
    ? {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 10 }
      }
    : {
        initial: { opacity: 0, y: -10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 }
      }

  // Determine width based on width prop
  const widthClass = width === 'sidebar' ? 'w-64 lg:w-64 xl:w-72' : 'w-52'

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            {...animationProps}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute bg-popover shadow-lg z-50 rounded-lg border border-border",
              widthClass,
              positionClasses
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface DropdownItemProps {
  onClick?: () => void
  className?: string
  children: ReactNode
}

export function DropdownItem({ onClick, className, children }: DropdownItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'px-4 py-3 text-sm text-popover-foreground hover:bg-sidebar-accent cursor-pointer transition-colors',
        className
      )}
    >
      {children}
    </div>
  )
}
