'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NftPromoBanner() {
  const pathname = usePathname();

  // Hide banner on pages where it doesn't belong
  const hiddenPaths = [
    '/nft',
    '/markets',
    '/chats',
    '/agents/team',
    '/settings',
  ];
  if (hiddenPaths.some((p) => pathname?.startsWith(p))) return null;

  return (
    <div className="mt-14 border-primary/30 border-b bg-primary md:mt-0">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-primary-foreground text-sm">
          <Image
            src="/blankmonkey.png"
            alt="ProtoMonkeys"
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 rounded-full"
          />
          <span className="font-bold text-base">ProtoMonkeys</span>
          <span className="hidden text-primary-foreground/80 sm:inline">
            {' '}
            — Exclusive NFTs for top 100 players
          </span>
        </div>
        <div className="flex shrink-0 items-center">
          <Link
            href="/nft"
            className="rounded-full bg-primary-foreground px-4 py-1.5 font-bold text-primary text-sm transition-colors hover:bg-primary-foreground/90"
          >
            View
          </Link>
        </div>
      </div>
    </div>
  );
}
