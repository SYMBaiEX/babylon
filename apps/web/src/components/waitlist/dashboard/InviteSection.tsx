'use client';

import { getReferralUrl } from '@babylon/shared';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface InviteSectionProps {
  inviteCode: string | null;
}

/**
 * Invite section with referral link and copy functionality.
 */
export function InviteSection({ inviteCode }: InviteSectionProps) {
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyInviteCode = async () => {
    if (!inviteCode) return;

    try {
      await navigator.clipboard.writeText(getReferralUrl(inviteCode));
      setCopiedCode(true);
      toast.success('Invite link copied!');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="rounded-xl border border-border/50 bg-background/30 p-5 backdrop-blur-sm sm:p-6">
      <h3 className="mb-3 font-bold text-xl">Invite Friends</h3>
      <p className="mb-4 text-muted-foreground text-sm leading-relaxed">
        <span className="font-bold text-primary">You earn:</span>
        <br />• 100 points per friend who signs up
        <br />• +100 extra when they complete profile
      </p>
      <div className="mb-4 rounded-lg border border-primary/20 bg-primary/10 p-3">
        <p className="text-foreground text-sm leading-relaxed">
          <span className="font-semibold">Friend bonus:</span> Your friends get
          an additional <span className="font-bold text-primary">100 points</span>{' '}
          when they join through your referral link!
        </p>
      </div>
      {inviteCode ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 break-all rounded-lg border border-border bg-background/50 px-3 py-2 font-mono text-xs sm:text-sm">
            {getReferralUrl(inviteCode)}
          </div>
          <button
            onClick={handleCopyInviteCode}
            className="flex min-h-[36px] shrink-0 touch-manipulation items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm transition-all duration-200 hover:bg-primary/90 active:scale-95 sm:min-h-[40px]"
          >
            {copiedCode ? (
              <>
                <Check className="h-4 w-4" />
                <span className="hidden sm:inline">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-center">
          <div className="text-sm text-yellow-600">Generating invite code...</div>
        </div>
      )}
    </div>
  );
}
