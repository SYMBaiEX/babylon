/**
 * Agent Detail Page - Redirects to Team Chat
 *
 * All agent management is done through the team chat interface, so this
 * route redirects on the server to `/agents/team?selectAgent=<agentId>`.
 *
 * @page /agents/[agentId]
 */

import { redirect } from 'next/navigation';

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  redirect(`/agents/team?selectAgent=${encodeURIComponent(agentId)}`);
}
