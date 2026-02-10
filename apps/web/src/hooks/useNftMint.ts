import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Hex } from 'viem';
import { confirmMintAction, prepareMintAction } from '@/app/_actions/nft';
import { useAuth } from '@/hooks/useAuth';
import type {
  EligibilityApiResponse,
  EligibilityResponse,
  MintConfirmResponse,
  MintFlowState,
} from '@/types/nft';

const MINTING_STATES = new Set<MintFlowState>([
  'preparing',
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
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();

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
        const token = await getAccessToken().catch(() => null);

        // Check if aborted before continuing
        if (signal?.aborted) return;

        const response = await fetch('/api/nft/eligibility', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: 'include',
          signal,
        });

        // Check if aborted before updating state
        if (signal?.aborted) return;

        if (response.status === 401) {
          setEligibility(notAuthenticated);
          setFlowState('idle');
          return;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          setError(errorData.error ?? 'Failed to check eligibility');
          setFlowState('error');
          return;
        }

        const json: EligibilityApiResponse = await response.json();
        const data: EligibilityResponse = json.data;

        // Check if aborted before updating state
        if (signal?.aborted) return;

        setEligibility(data);

        if (data.status === 'already_minted' && data.mintedNft) {
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
    const handleError = (message: string, errorId?: string) => {
      const uiMessage = errorId ? `${message} (Ref: ${errorId})` : message;
      setError(uiMessage);
      toast.error(uiMessage);
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

    // Find embedded wallet for sending the transaction
    const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
    if (!embeddedWallet) {
      handleError('Embedded wallet not found. Please try logging in again.');
      return;
    }

    setFlowState('preparing');
    setError(null);

    try {
      // Step 1: Get access token
      let userJwt: string | null;
      try {
        userJwt = await getAccessToken();
      } catch {
        userJwt = null;
      }
      if (!userJwt) {
        handleError(
          'Your session has expired. Please sign in again and try minting.'
        );
        return;
      }

      // Step 2: Server prepares the transaction (auth, eligibility, signature)
      const prepareResult = await prepareMintAction({ userJwt });

      if (prepareResult.status === 'error') {
        console.error('[NFT Mint Error]', {
          step: prepareResult.step,
          errorId: prepareResult.errorId,
          message: prepareResult.error,
        });
        handleError(
          `Mint failed at ${prepareResult.step}: ${prepareResult.error}`,
          prepareResult.errorId
        );
        return;
      }

      // Step 3: Send transaction client-side via Privy's embedded wallet
      setFlowState('minting');

      // Switch to the correct chain if needed
      const currentChainId = parseInt(
        embeddedWallet.chainId.split(':')[1] ?? '0',
        10
      );
      if (currentChainId !== prepareResult.chainId) {
        try {
          await embeddedWallet.switchChain(prepareResult.chainId);
        } catch {
          // switchChain may throw if already on correct chain or not supported
          console.warn('[NFT Mint] Chain switch failed, proceeding anyway');
        }
      }

      let txHash: Hex;
      try {
        const receipt = await sendTransaction(
          {
            to: prepareResult.to,
            data: prepareResult.data,
            chainId: prepareResult.chainId,
          },
          {
            address: embeddedWallet.address,
            sponsor: true,
          }
        );
        txHash = receipt.hash as Hex;
      } catch (sendErr) {
        const msg =
          sendErr instanceof Error ? sendErr.message : 'Transaction rejected';
        console.error('[NFT Mint] Send transaction error:', msg);
        handleError(`Transaction failed: ${msg}`);
        return;
      }

      // Step 4: Confirm the mint on the server (polls chain + updates DB)
      setFlowState('confirming');

      const confirmJwt = await getAccessToken().catch(() => null);
      const result = await confirmMintAction({
        userJwt: confirmJwt ?? undefined,
        txHash,
      });

      if (result.status === 'error') {
        console.error('[NFT Mint Error]', {
          step: result.step,
          errorId: result.errorId,
          message: result.error,
        });
        handleError(
          `Mint failed at ${result.step}: ${result.error}`,
          result.errorId
        );
        return;
      }

      if (result.status === 'pending') {
        toast.info(result.message, { duration: 10000 });
        setFlowState('eligible');
        return;
      }

      // Transaction confirmed
      setMintedNft(result.nft);
      setFlowState('revealing');
      setEligibility((prev) =>
        prev
          ? {
              ...prev,
              hasMinted: true,
              status: 'already_minted',
              mintedNft: {
                tokenId: result.nft.tokenId,
                name: result.nft.name,
                thumbnailUrl: result.nft.thumbnailUrl ?? result.nft.imageUrl,
                txHash: result.txHash,
              },
            }
          : null
      );

      toast.success('NFT minted successfully!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      handleError(message);
    }
  }, [authenticated, eligibility, getAccessToken, wallets, sendTransaction]);

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
