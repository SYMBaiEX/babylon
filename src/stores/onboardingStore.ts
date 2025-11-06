import { create } from 'zustand'
import type { OnboardingIntentResponse } from '@/lib/services/onboarding-service'

type Intent = OnboardingIntentResponse | null

interface OnboardingState {
  intent: Intent
  setIntent: (intent: OnboardingIntentResponse) => void
  mergeIntent: (partial: Partial<OnboardingIntentResponse>) => void
  clearIntent: () => void
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  intent: null,
  setIntent: (intent) => set({ intent }),
  mergeIntent: (partial) => {
    const current = get().intent
    if (!current) {
      if (partial.intentId && partial.status) {
        set({ intent: partial as OnboardingIntentResponse })
      }
      return
    }
    set({ intent: { ...current, ...partial, timestamps: { ...current.timestamps, ...(partial.timestamps ?? {}) } } })
  },
  clearIntent: () => set({ intent: null }),
}))
