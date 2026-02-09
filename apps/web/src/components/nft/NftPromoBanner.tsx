import Image from 'next/image'
import Link from 'next/link'

export function NftPromoBanner() {
  return (
    <div className="mt-14 border-b border-primary/30 bg-primary md:mt-0">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-sm text-primary-foreground">
          <Image
            src="/blankmonkey.png"
            alt="ProtoMonkeys"
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 rounded-full"
          />
          <span className="text-base font-bold">ProtoMonkeys</span>
          <span className="hidden text-primary-foreground/80 sm:inline">
            {' '}
            — Exclusive NFTs for top 100 players on leaderboard
          </span>
        </div>
        <div className="flex shrink-0 items-center">
          <Link
            href="/nft"
            className="rounded-full bg-primary-foreground px-4 py-1.5 text-sm font-bold text-primary transition-colors hover:bg-primary-foreground/90"
          >
            View
          </Link>
        </div>
      </div>
    </div>
  )
}
