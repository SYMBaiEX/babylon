/**
 * NFT Minting Hook
 *
 * Provides functionality for minting NFTs from the Babylon Top 100 collection.
 * Handles eligibility checking, transaction preparation, wallet signing,
 * and confirmation flow with reveal animation state.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useSmartWallet } from '@/hooks/useSmartWallet';
import type {
  EligibilityResponse,
  MintConfirmResponse,
  MintFlowState,
  MintPrepareResponse,
} from '@/types/nft';

/** States that indicate minting is in progress */
const MINTING_STATES: MintFlowState[] = [
  'preparing',
  'awaiting_signature',
  'minting',
  'confirming',
];

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

  // Check eligibility on mount and when auth changes
  const checkEligibility = useCallback(async () => {
    const notAuthenticatedResponse: EligibilityResponse = {
      eligible: false,
      status: 'not_authenticated',
      hasMinted: false,
    };

    if (!authenticated) {
      setEligibility(notAuthenticatedResponse);
      return;
    }

    setIsCheckingEligibility(true);
    setFlowState('checking_eligibility');
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setEligibility(notAuthenticatedResponse);
      setFlowState('idle');
      setIsCheckingEligibility(false);
      return;
    }

    const response = await fetch('/api/nft/eligibility', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorData = await response.json();
      setError(errorData.error ?? 'Failed to check eligibility');
      setFlowState('error');
      setIsCheckingEligibility(false);
      return;
    }

    const data: EligibilityResponse = await response.json();
    setEligibility(data);

    // Pre-populate mintedNft if user already minted
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
    setIsCheckingEligibility(false);
  }, [authenticated, getAccessToken]);

  // Start the minting process
  const startMint = useCallback(async () => {
    if (!authenticated) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!eligibility?.eligible || eligibility.hasMinted) {
      toast.error('You are not eligible to mint');
      return;
    }

    if (!smartWalletReady || !smartWalletAddress) {
      toast.error(
        'Smart wallet not ready. Please wait a moment and try again.'
      );
      return;
    }

    setFlowState('preparing');
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      toast.error('Authentication failed');
      setFlowState('error');
      return;
    }

    // Step 1: Prepare mint transaction
    const prepareResponse = await fetch('/api/nft/mint/prepare', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!prepareResponse.ok) {
      const errorData = await prepareResponse.json();
      const errorMessage = errorData.error ?? 'Failed to prepare mint';
      setError(errorMessage);
      toast.error(errorMessage);
      setFlowState('error');
      return;
    }

    const prepareData: MintPrepareResponse = await prepareResponse.json();

    setFlowState('awaiting_signature');

    // Step 2: Execute transaction via smart wallet
    let txHash: string;

    // For now, since the actual NFT contract isn't deployed, we'll simulate
    // In production, this would call the actual contract
    const isContractDeployed =
      prepareData.contractAddress !==
      '0x0000000000000000000000000000000000000000';

    if (isContractDeployed) {
      // Real contract - send transaction
      setFlowState('minting');

      const tx = await sendSmartWalletTransaction({
        to: prepareData.contractAddress as `0x${string}`,
        data: encodeMintFunctionCall(
          prepareData.functionName,
          prepareData.args
        ),
        value: BigInt(prepareData.value),
      });

      txHash = tx;
    } else {
      // Placeholder contract - simulate transaction
      // This allows testing the flow before contract deployment
      setFlowState('minting');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      txHash = `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`;
    }

    setFlowState('confirming');

    // Step 3: Confirm mint with backend
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
      const errorData = await confirmResponse.json();
      const errorMessage = errorData.error ?? 'Failed to confirm mint';
      setError(errorMessage);
      toast.error(errorMessage);
      setFlowState('error');
      return;
    }

    const confirmData: MintConfirmResponse = await confirmResponse.json();

    // Step 4: Trigger reveal animation
    setMintedNft(confirmData.nft);
    setFlowState('revealing');

    // Update eligibility to reflect minted status
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

  // Reset the flow (after reveal animation)
  const resetFlow = useCallback(() => {
    setFlowState(eligibility?.hasMinted ? 'complete' : 'eligible');
    setError(null);
  }, [eligibility?.hasMinted]);

  // Auto-check eligibility on auth change
  useEffect(() => {
    if (authenticated) {
      checkEligibility();
    } else {
      setEligibility(null);
      setFlowState('idle');
    }
  }, [authenticated, checkEligibility]);

  const isMinting = MINTING_STATES.includes(flowState);

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

/**
 * Encode a mint function call for the NFT contract
 *
 * This is a simplified encoder for the mint(address) function.
 * In production, you'd use viem's encodeFunctionData.
 */
function encodeMintFunctionCall(
  functionName: string,
  args: string[]
): `0x${string}` {
  // Function selector for mint(address) = keccak256("mint(address)")[:4]
  // = 0x6a627842
  const mintSelector = '0x6a627842';

  if (functionName === 'mint' && args.length === 1) {
    // Encode the address argument (padded to 32 bytes)
    const addressArg = args[0]!
      .toLowerCase()
      .replace('0x', '')
      .padStart(64, '0');
    return `${mintSelector}${addressArg}` as `0x${string}`;
  }

  // Default: just return empty data
  return '0x' as `0x${string}`;
}
