import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useInteractionStore } from '@/stores/interactionStore'
import type { InteractionError } from '@/types/interactions'

/**
 * Hook to display toast notifications for interaction errors
 * Monitors the error state in interactionStore and shows toasts
 */
export function useErrorToasts() {
  const { errors } = useInteractionStore()
  const prevErrorsRef = useRef<Map<string, InteractionError>>(new Map())

  useEffect(() => {
    // Compare current errors with previous errors
    const currentErrors = new Map(errors)
    const prevErrors = prevErrorsRef.current

    // Find new errors that weren't in previous state
    currentErrors.forEach((error, key) => {
      const prevError = prevErrors.get(key)
      if (!prevError || prevError.message !== error.message) {
        // Show error toast for new error
        toast.error('Interaction Failed', {
          description: error.message,
          duration: 4000,
        })
      }
    })

    // Update ref with current errors
    prevErrorsRef.current = currentErrors
  }, [errors])
}
