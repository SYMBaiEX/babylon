import { isNftGatingEnabled } from '@babylon/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ComingSoon } from '@/components/shared/ComingSoon';
import { isWaitlistHostname } from '@/lib/host-routing';
import { HomePageClient } from './HomePageClient';

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const hostHeader = (await headers()).get('host') ?? '';
  const hostname = hostHeader.split(':')[0]?.toLowerCase() ?? '';
  const isWaitlistHost = isWaitlistHostname(hostname);

  if (isWaitlistHost) {
    return <ComingSoon />;
  }

  const nftGatingEnabled = isNftGatingEnabled();

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
