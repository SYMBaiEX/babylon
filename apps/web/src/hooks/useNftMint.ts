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

  const checkEligibility = useCallback(async () => {
    if (!authenticated) {
      setEligibility({ eligible: false, status: 'not_authenticated', hasMinted: false });
      return;
    }

    setIsCheckingEligibility(true);
    setFlowState('checking_eligibility');
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setEligibility({ eligible: false, status: 'not_authenticated', hasMinted: false });
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
      toast.error('Smart wallet not ready');
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

    if (prepareData.contractAddress === '0x0000000000000000000000000000000000000000') {
      setError('NFT contract not deployed');
      toast.error('NFT contract not deployed');
      setFlowState('error');
      return;
    }

    setFlowState('minting');

    const txHash = await sendSmartWalletTransaction({
      to: prepareData.contractAddress as `0x${string}`,
      data: encodeMintFunctionCall(prepareData.functionName, prepareData.args),
      value: BigInt(prepareData.value),
    });

    setFlowState('confirming');

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
    setFlowState(eligibility?.hasMinted ? 'complete' : 'eligible');
    setError(null);
  }, [eligibility?.hasMinted]);

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

function encodeMintFunctionCall(functionName: string, args: string[]): `0x${string}` {
  if (functionName !== 'mint' || args.length !== 1) {
    throw new Error(`Unsupported: ${functionName}(${args.length} args)`);
  }

  const address = args[0]!;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  // mint(address) selector + padded address
  return `0x6a627842${address.slice(2).toLowerCase().padStart(64, '0')}` as `0x${string}`;
}
