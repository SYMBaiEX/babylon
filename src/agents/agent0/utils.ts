import type { AgentCapabilities } from '@/a2a/types'
import { AgentCapabilitiesSchema } from '@/a2a/types'

const DefaultCapabilities: AgentCapabilities = {
  strategies: [],
  markets: [],
  actions: [],
  version: '1.0.0',
}

export function parseAgentCapabilities(capabilitiesJson?: string | null): AgentCapabilities {
  if (!capabilitiesJson) {
    return { ...DefaultCapabilities }
  }

  try {
    const raw = JSON.parse(capabilitiesJson)
    if (typeof raw !== 'object' || raw === null) {
      return { ...DefaultCapabilities }
    }

    const result = AgentCapabilitiesSchema.partial().safeParse(raw)
    const validated = result.success ? result.data : {}

    return {
      ...DefaultCapabilities,
      ...raw,
      ...validated,
    }
  } catch {
    // swallow parse errors and fall through to default
  }

  return { ...DefaultCapabilities }
}
