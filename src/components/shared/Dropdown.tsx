'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode
  className?: string
  menuPosition?: 'top' | 'bottom'
}

export function Dropdown({ trigger, children, className, menuPosition = 'bottom' }: DropdownProps) {
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

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: menuPosition === 'top' ? 10 : -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: menuPosition === 'top' ? 10 : -10 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute right-0 w-48 bg-popover border border-border rounded-lg shadow-lg z-50",
              menuPosition === 'bottom' ? 'mt-2' : 'bottom-full mb-2'
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
        'px-4 py-2 text-sm text-popover-foreground hover:bg-muted cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  )
}
