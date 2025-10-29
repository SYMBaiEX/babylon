import { create } from 'zustand'

interface LoginModalState {
  isOpen: boolean
  context?: string
  title?: string
  message?: string
  showLoginModal: (options?: { context?: string; title?: string; message?: string }) => void
  closeLoginModal: () => void
}

export const useLoginModal = create<LoginModalState>((set) => ({
  isOpen: false,
  context: undefined,
  title: undefined,
  message: undefined,
  showLoginModal: (options) =>
    set({
      isOpen: true,
      context: options?.context,
      title: options?.title,
      message: options?.message,
    }),
  closeLoginModal: () =>
    set({
      isOpen: false,
      context: undefined,
      title: undefined,
      message: undefined,
    }),
}))

