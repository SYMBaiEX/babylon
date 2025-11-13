import { AgentCapabilitiesSchema, type AgentCapabilities } from '@/a2a/types';

const DefaultCapabilities: AgentCapabilities = {
  strategies: [],
  markets: [],
  actions: [],
  version: '1.0.0',
};

export function parseAgentCapabilities(capabilitiesJson?: string | null): AgentCapabilities {
  if (!capabilitiesJson) {
    return { ...DefaultCapabilities };
  }

  try {
    const raw = JSON.parse(capabilitiesJson);
    const result = AgentCapabilitiesSchema.partial().safeParse(raw);
    
    if (!result.success) {
      return { ...DefaultCapabilities };
    }

    return {
      ...DefaultCapabilities,
      ...result.data,
    };
  } catch {
    return { ...DefaultCapabilities };
  }
}
