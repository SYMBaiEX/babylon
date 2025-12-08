'use client';

import { usePrivy } from '@privy-io/react-auth';

interface JoinWaitlistButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function JoinWaitlistButton({ className, children }: JoinWaitlistButtonProps) {
  const { login } = usePrivy();

  const handleClick = () => {
    login();
  };

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
