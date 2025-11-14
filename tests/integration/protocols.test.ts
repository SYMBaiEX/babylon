import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Wallet, verifyMessage } from 'ethers'
import { buildAgentCard } from '@/app/.well-known/agent-card/route'
import { MCP_TOOLS, MCP_VERSION } from '@/app/mcp/tools'
import { buildA2AAuthMessage } from '@/a2a/utils/auth'

const ORIGINAL_ENV = process.env

describe('protocol surfaces', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    process.env.AGENT0_PRIVATE_KEY =
      process.env.AGENT0_PRIVATE_KEY || `0x${'11'.repeat(32)}`
    process.env.AGENT0_RPC_URL = process.env.AGENT0_RPC_URL || 'https://rpc.example'
    process.env.BASE_CHAIN_ID = '8453'
    process.env.BASE_IDENTITY_REGISTRY_ADDRESS =
      process.env.BASE_IDENTITY_REGISTRY_ADDRESS || `0x${'22'.repeat(20)}`
    process.env.BASE_REPUTATION_SYSTEM_ADDRESS =
      process.env.BASE_REPUTATION_SYSTEM_ADDRESS || `0x${'33'.repeat(20)}`
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example'
    process.env.BABYLON_A2A_URL = 'wss://a2a.example'
    process.env.BABYLON_MCP_URL = 'https://app.example/mcp'
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('builds a standards-compliant Agent Card', () => {
    const card = buildAgentCard()
    expect(card.schema).toContain('agent-card')
    expect(card.protocols.mcp.endpoint).toContain('/mcp')
    expect(card.registries.base.identity).toMatch(/^0x/)
  })

  it('exposes MCP tool metadata', () => {
    const toolNames = MCP_TOOLS.map((t) => t.name)
    expect(MCP_VERSION).toBe('2025-06-18')
    expect(toolNames).toContain('get_markets')
    expect(toolNames).toContain('place_bet')
  })

  it('builds deterministic A2A auth messages', async () => {
    const wallet = Wallet.createRandom()
    const timestamp = Date.now()
    const tokenId = 42
    const message = buildA2AAuthMessage('agent.test', wallet.address, tokenId, timestamp)
    const signature = await wallet.signMessage(message)
    const recovered = verifyMessage(message, signature)
    expect(recovered.toLowerCase()).toEqual(wallet.address.toLowerCase())
  })
})

