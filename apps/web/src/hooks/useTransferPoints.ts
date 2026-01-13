'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getAuthToken } from '@/lib/auth';

/**
 * Options for configuring the useTransferPoints hook.
 */
interface UseTransferPointsOptions {
  /** Optional function to get the access token. Falls back to getAuthToken() */
  getAccessToken?: () => Promise<string | null> | string | null;
}

/**
 * Payload for transferring points.
 */
interface TransferPointsPayload {
  /** Recipient user ID */
  recipientId: string;
  /** Amount of points to transfer */
  amount: number;
  /** Optional message to include with the transfer */
  message?: string;
}

/**
 * Response from the transfer points API.
 */
interface TransferPointsResponse {
  success: boolean;
  newBalance: number;
  recipientNewBalance?: number;
}

async function resolveToken(
  resolver?: () => Promise<string | null> | string | null
): Promise<string | null> {
  if (!resolver) {
    return getAuthToken();
  }

  const value = typeof resolver === 'function' ? resolver() : resolver;
  const token = await Promise.resolve(value);
  return token;
}

/**
 * Hook for transferring points to other users with automatic cache invalidation.
 *
 * Uses React Query mutation to handle the transfer operation and automatically
 * invalidates relevant queries to ensure UI updates reflect the new balances.
 *
 * Cache invalidation includes:
 * - User balance queries
 * - Agent balance queries (if recipient is an agent)
 * - User profile queries
 *
 * @param options - Configuration options including getAccessToken
 *
 * @returns An object containing:
 * - `transferPoints`: Function to transfer points to a recipient
 * - `isLoading`: Whether a transfer is in progress
 * - `error`: Any error that occurred during transfer
 * - `data`: Response data from successful transfer
 * - `reset`: Function to reset mutation state
 *
 * @example
 * ```tsx
 * const { transferPoints, isLoading, error } = useTransferPoints();
 *
 * const handleSend = async () => {
 *   try {
 *     await transferPoints({
 *       recipientId: 'user-123',
 *       amount: 100,
 *       message: 'Thanks for the help!'
 *     });
 *     toast.success('Points sent!');
 *   } catch (err) {
 *     toast.error('Failed to send points');
 *   }
 * };
 * ```
 */
export function useTransferPoints(options: UseTransferPointsOptions = {}) {
  const { getAccessToken: getToken } = options;
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: TransferPointsPayload) => {
      const token = await resolveToken(getToken);

      const response = await fetch('/api/points/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to transfer points');
      }

      return (await response.json()) as TransferPointsResponse;
    },
    onSuccess: (data, variables) => {
      // Invalidate all balance-related queries to refresh UI
      // This ensures sender and recipient balances update immediately

      // Invalidate user balance queries (generic patterns)
      void queryClient.invalidateQueries({ queryKey: ['user', 'balance'] });
      void queryClient.invalidateQueries({ queryKey: ['balance'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet', 'balance'] });

      // Invalidate specific recipient queries (could be user or agent)
      void queryClient.invalidateQueries({
        queryKey: ['user', variables.recipientId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['agent', variables.recipientId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['agent-balance', variables.recipientId],
      });

      // Invalidate user profile queries that may show balance
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });

  const transferPoints = useCallback(
    async (payload: TransferPointsPayload) => {
      return mutation.mutateAsync(payload);
    },
    [mutation]
  );

  return {
    transferPoints,
    isLoading: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
