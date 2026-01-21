import { redirect } from 'next/navigation';
import { HomePageClient } from './HomePageClient';

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const nftGatingFlag = process.env.NFT_GATING_ENABLED ?? '';
  const nftGatingEnabled = ['true', '1', 'yes', 'on'].includes(
    nftGatingFlag.toLowerCase()
  );

  if (nftGatingEnabled) {
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const ref = resolvedSearchParams?.ref;
    const referralCode = Array.isArray(ref) ? ref[0] : ref;
    const params = new URLSearchParams();
    if (referralCode) params.set('ref', referralCode);
    params.set('gated', '1');

    const qs = params.toString();
    redirect(qs ? `/nft?${qs}` : '/nft');
  }

  return <HomePageClient />;
}
