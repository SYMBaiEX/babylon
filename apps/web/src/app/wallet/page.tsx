'use client';

import { CHAIN } from '@babylon/shared';
import { useFundWallet } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { NftPortfolio } from '@/components/wallet/NftPortfolio';
import { ReceiveModal } from '@/components/wallet/ReceiveModal';
import { SendModal } from '@/components/wallet/SendModal';
import { TokenList } from '@/components/wallet/TokenList';
import { TransactionHistory } from '@/components/wallet/TransactionHistory';
import { WalletEmptyState } from '@/components/wallet/WalletEmptyState';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { WalletOverview } from '@/components/wallet/WalletOverview';
import { type WalletTab, WalletTabs } from '@/components/wallet/WalletTabs';
import { useAuth } from '@/hooks/useAuth';
import {
  useOnchainNfts,
  useOnchainTokens,
  useOnchainTransactions,
  useOnchainWalletPolling,
} from '@/stores/onchainWalletStore';

export default function WalletPage() {
  const router = useRouter();
  const { ready, authenticated, embeddedWalletAddress, login } = useAuth();
  const [activeTab, setActiveTab] = useState<WalletTab>('overview');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const address = embeddedWalletAddress ?? null;

  // Redirect unauthenticated users
  useEffect(() => {
    if (!ready || authenticated) return;
    router.push('/feed');
    const timer = setTimeout(() => login(), 500);
    return () => clearTimeout(timer);
  }, [ready, authenticated, router, login]);

  // Fetch data
  const {
    nativeBalance,
    tokens,
    loading: tokensLoading,
    error: tokensError,
    refresh: refreshTokens,
  } = useOnchainTokens(address);

  const {
    collections,
    totalCount: nftCount,
    loading: nftsLoading,
    error: nftsError,
    refresh: refreshNfts,
  } = useOnchainNfts(address);

  const {
    transactions,
    loading: txsLoading,
    error: txsError,
    refresh: refreshTxs,
  } = useOnchainTransactions(address);

  // Poll token balances every 30s
  useOnchainWalletPolling(address, 30_000);

  const { fundWallet } = useFundWallet();

  const handleFund = useCallback(() => {
    if (address) {
      fundWallet({
        address,
        options: { chain: CHAIN, asset: 'native-currency' },
      });
    }
  }, [address, fundWallet]);

  const handleSend = useCallback(() => {
    setSendOpen(true);
  }, []);

  if (!ready) {
    return <WalletPageSkeleton />;
  }

  if (!authenticated || !address) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <WalletEmptyState
          title="Connect your wallet"
          description="Log in to access your wallet and manage your on-chain assets."
          action={{ label: 'Log In', onClick: login }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto border-border lg:border-l">
      <div className="w-full space-y-4 p-4 sm:p-6">
        <WalletHeader address={address} />

        <WalletTabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="pb-8">
          {activeTab === 'overview' && (
            <WalletOverview
              nativeBalance={nativeBalance}
              tokens={tokens}
              transactions={transactions}
              loading={tokensLoading}
              onNavigateTab={setActiveTab}
              onSend={() => handleSend()}
              onReceive={() => setReceiveOpen(true)}
            />
          )}

          {activeTab === 'tokens' && (
            <TokenList
              nativeBalance={nativeBalance}
              tokens={tokens}
              loading={tokensLoading}
              error={tokensError}
              onRefresh={refreshTokens}
              onSend={() => handleSend()}
              onFund={handleFund}
            />
          )}

          {activeTab === 'nfts' && (
            <NftPortfolio
              collections={collections}
              totalCount={nftCount}
              loading={nftsLoading}
              error={nftsError}
              onRefresh={refreshNfts}
            />
          )}

          {activeTab === 'activity' && (
            <TransactionHistory
              transactions={transactions}
              loading={txsLoading}
              error={txsError}
              onRefresh={refreshTxs}
              walletAddress={address}
            />
          )}
        </div>
      </div>

      <ReceiveModal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        address={address}
        chainName={CHAIN.name}
      />

      <SendModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        nativeBalance={nativeBalance}
        tokens={tokens}
        senderAddress={address}
        onSuccess={() => {
          refreshTokens();
          refreshTxs();
        }}
      />
    </div>
  );
}

function WalletPageSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto border-border lg:border-l">
      <div className="w-full space-y-4 p-4 sm:p-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-6 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
        </div>
        {/* Tabs skeleton */}
        <div className="flex gap-4 border-border border-b pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-5 w-16 animate-pulse rounded bg-muted" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="rounded-xl border border-border p-6">
          <div className="mb-2 h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
