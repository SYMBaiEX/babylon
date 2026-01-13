import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useSmartWallet } from '@/hooks/useSmartWallet';
import type {
  EligibilityResponse,
  MintConfirmResponse,
  MintFlowState,
  MintPrepareResponse,
} from '@/types/nft';

const MINTING_STATES = new Set<MintFlowState>([
  'preparing',
  'awaiting_signature',
  'minting',
  'confirming',
]);

interface UseNftMintResult {
  eligibility: EligibilityResponse | null;
  isCheckingEligibility: boolean;
  isMinting: boolean;
  flowState: MintFlowState;
  mintedNft: MintConfirmResponse['nft'] | null;
  error: string | null;
  checkEligibility: () => Promise<void>;
  startMint: () => Promise<void>;
  resetFlow: () => void;
}

export function useNftMint(): UseNftMintResult {
  const { authenticated, getAccessToken } = useAuth();
  const { smartWalletReady, smartWalletAddress, sendSmartWalletTransaction } =
    useSmartWallet();

  const [eligibility, setEligibility] = useState<EligibilityResponse | null>(
    null
  );
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [flowState, setFlowState] = useState<MintFlowState>('idle');
  const [mintedNft, setMintedNft] = useState<MintConfirmResponse['nft'] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const checkEligibility = useCallback(
    async (signal?: AbortSignal) => {
      const notAuthenticated: EligibilityResponse = {
        eligible: false,
        status: 'not_authenticated',
        hasMinted: false,
      };

      if (!authenticated) {
        setEligibility(notAuthenticated);
        return;
      }

      setIsCheckingEligibility(true);
      setFlowState('checking_eligibility');
      setError(null);

      try {
        const token = await getAccessToken();

        // Check if aborted before continuing
        if (signal?.aborted) return;

        if (!token) {
          setEligibility(notAuthenticated);
          setFlowState('idle');
          setIsCheckingEligibility(false);
          return;
        }

        const response = await fetch('/api/nft/eligibility', {
          headers: { Authorization: `Bearer ${token}` },
          signal, // Pass abort signal to fetch
        });

        // Check if aborted before updating state
        if (signal?.aborted) return;

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          setError(errorData.error ?? 'Failed to check eligibility');
          setFlowState('error');
          setIsCheckingEligibility(false);
          return;
        }

        const data: EligibilityResponse = await response.json();

        // Check if aborted before updating state
        if (signal?.aborted) return;

        setEligibility(data);

        if (data.status === 'already_minted' && data.mintedNft) {
          // Note: eligibility endpoint only provides thumbnailUrl, not full resolution.
          // The thumbnailUrl is used as imageUrl here for display purposes.
          setMintedNft({
            tokenId: data.mintedNft.tokenId,
            name: data.mintedNft.name,
            imageUrl: data.mintedNft.thumbnailUrl,
            thumbnailUrl: data.mintedNft.thumbnailUrl,
            storyTitle: null,
          });
        }

        setFlowState(data.eligible ? 'eligible' : 'idle');
      } catch (err) {
        // Ignore abort errors - component unmounted
        if (err instanceof DOMException && err.name === 'AbortError') return;

        const message = err instanceof Error ? err.message : 'Network error';
        setError(message);
        setFlowState('error');
      } finally {
        // Only update if not aborted
        if (!signal?.aborted) {
          setIsCheckingEligibility(false);
        }
      }
    },
    [authenticated, getAccessToken]
  );

  const startMint = useCallback(async () => {
    const handleError = (message: string) => {
      setError(message);
      toast.error(message);
      setFlowState('error');
    };

    if (!authenticated) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!eligibility?.eligible || eligibility.hasMinted) {
      toast.error('You are not eligible to mint');
      return;
    }

    if (!smartWalletReady || !smartWalletAddress) {
      toast.error('Smart wallet not ready');
      return;
    }

    setFlowState('preparing');
    setError(null);

    let token: string | null;
    try {
      token = await getAccessToken();
    } catch {
      handleError('Authentication failed');
      return;
    }

    if (!token) {
      handleError('Authentication failed');
      return;
    }

    // Step 1: Prepare mint (get signature from backend)
    let prepareData: MintPrepareResponse;
    try {
      const prepareResponse = await fetch('/api/nft/mint/prepare', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json().catch(() => ({}));
        handleError(errorData.error ?? 'Failed to prepare mint');
        return;
      }

      prepareData = await prepareResponse.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      handleError(`Failed to prepare mint: ${message}`);
      return;
    }

    // Validate response data before transitioning to awaiting_signature state
    const zeroAddress = '0x0000000000000000000000000000000000000000';
    if (prepareData.contractAddress === zeroAddress) {
      handleError('NFT contract not deployed');
      return;
    }

    if (!prepareData.encodedData || !prepareData.signature) {
      handleError('Failed to generate mint signature');
      return;
    }

    // Only transition to awaiting_signature after validation passes
    setFlowState('awaiting_signature');

    // Step 2: Send transaction
    setFlowState('minting');

    let txHash: string;
    try {
      txHash = await sendSmartWalletTransaction({
        to: prepareData.contractAddress as `0x${string}`,
        data: prepareData.encodedData as `0x${string}`,
        value: 0n,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      // User rejection is common, don't show harsh error
      if (message.includes('rejected') || message.includes('denied')) {
        setFlowState('eligible');
        setError(null);
        return;
      }
      handleError(message);
      return;
    }

    // Step 3: Confirm mint on backend
    setFlowState('confirming');

    let confirmData: MintConfirmResponse;
    try {
      const confirmResponse = await fetch('/api/nft/mint/confirm', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash,
          walletAddress: smartWalletAddress,
        }),
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json().catch(() => ({}));
        handleError(errorData.error ?? 'Failed to confirm mint');
        return;
      }

      confirmData = await confirmResponse.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      // Transaction succeeded but confirm failed - don't lose the tx
      handleError(
        `Mint confirmed on chain but database update failed: ${message}. TX: ${txHash}`
      );
      return;
    }

    // Update state with minted NFT
    setMintedNft(confirmData.nft);
    setFlowState('revealing');
    setEligibility((prev) =>
      prev
        ? {
            ...prev,
            hasMinted: true,
            status: 'already_minted',
            mintedNft: {
              tokenId: confirmData.nft.tokenId,
              name: confirmData.nft.name,
              thumbnailUrl: confirmData.nft.thumbnailUrl ?? '',
              txHash,
            },
          }
        : null
    );

    toast.success('NFT minted successfully!');
  }, [
    authenticated,
    eligibility,
    smartWalletReady,
    smartWalletAddress,
    getAccessToken,
    sendSmartWalletTransaction,
  ]);

  const resetFlow = useCallback(() => {
    setFlowState(
      eligibility?.hasMinted
        ? 'complete'
        : eligibility?.eligible
          ? 'eligible'
          : 'idle'
    );
    setError(null);
  }, [eligibility?.hasMinted, eligibility?.eligible]);

  const checkEligibilityRef = useRef(checkEligibility);
  useEffect(() => {
    checkEligibilityRef.current = checkEligibility;
  }, [checkEligibility]);

  useEffect(() => {
    const abortController = new AbortController();

    if (authenticated) {
      checkEligibilityRef.current(abortController.signal);
    } else {
      setEligibility(null);
      setFlowState('idle');
    }

    return () => {
      abortController.abort();
    };
  }, [authenticated]);

  const isMinting = MINTING_STATES.has(flowState);

  return {
    eligibility,
    isCheckingEligibility,
    isMinting,
    flowState,
    mintedNft,
    error,
    checkEligibility,
    startMint,
    resetFlow,
  };
}
