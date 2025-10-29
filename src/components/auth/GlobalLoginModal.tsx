'use client'

import { LoginModal } from './LoginModal'
import { useLoginModal } from '@/hooks/useLoginModal'

export function GlobalLoginModal() {
  const { isOpen, closeLoginModal, title, message } = useLoginModal()

  return (
    <LoginModal
      isOpen={isOpen}
      onClose={closeLoginModal}
      title={title}
      message={message}
    />
  )
}

