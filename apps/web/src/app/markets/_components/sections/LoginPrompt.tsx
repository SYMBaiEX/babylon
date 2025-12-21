'use client';

interface LoginPromptProps {
  onLogin: () => void;
}

/**
 * Compact login prompt shown at the bottom of market lists
 * when user is not authenticated.
 */
export function LoginPrompt({ onLogin }: LoginPromptProps) {
  return (
    <div className="bg-muted/30 p-4 text-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <p className="mb-3 text-muted-foreground text-sm">Log in to trade</p>
      <button
        type="button"
        onClick={onLogin}
        className="cursor-pointer rounded bg-[#0066FF] px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-[#2952d9]"
      >
        Connect Wallet
      </button>
    </div>
  );
}

