'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect } from 'react'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message?: string
}

export function LoginModal({ isOpen, onClose, title, message }: LoginModalProps) {
  const { login, authenticated, ready } = usePrivy()

  // Close modal when user logs in
  useEffect(() => {
    if (authenticated && isOpen) {
      onClose()
    }
  }, [authenticated, isOpen, onClose])

  // Trigger Privy's built-in login modal when this component opens
  useEffect(() => {
    if (isOpen && ready && !authenticated) {
      login()
    }
  }, [isOpen, ready, authenticated, login])

  // This component just triggers Privy's native modal, no custom UI needed
  return null
}

