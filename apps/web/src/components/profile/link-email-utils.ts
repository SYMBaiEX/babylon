export function getLinkedEmail(
  privyEmail?: string | null,
  storedEmail?: string | null
): string | null {
  const normalizedPrivy = privyEmail?.trim() || '';
  if (normalizedPrivy) return normalizedPrivy;

  const normalizedStored = storedEmail?.trim() || '';
  return normalizedStored || null;
}

export function isLinkEmailFlowCancellationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes('exited');
}
