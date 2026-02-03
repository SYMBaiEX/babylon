const DEFAULT_WAITLIST_HOSTS = [
  'babylon.market',
  'www.babylon.market',
  'staging.babylon.market',
] as const;

export function getWaitlistHostnames(): Set<string> {
  const raw = process.env.WAITLIST_HOSTNAMES;
  if (!raw || raw.trim().length === 0) return new Set(DEFAULT_WAITLIST_HOSTS);

  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0)
  );
}

export function isWaitlistHostname(hostname: string): boolean {
  return getWaitlistHostnames().has(hostname.toLowerCase());
}

