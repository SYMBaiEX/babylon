#!/usr/bin/env bun
/**
 * Run All Eliza Agents
 * 
 * Orchestrates multiple Babylon-playing agents with:
 * - Deterministic HD wallet generation
 * - Agent0 registry discovery
 * - Automatic on-chain registration
 * - A2A protocol connection
 * - Graceful lifecycle management
 */

import { spawn, type ChildProcess } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { AgentManifest, ManifestList } from './types/agent-config'
import { discoverBabylon, validateEndpoints } from './lib/babylon-discovery'
import { onboardAgent } from './lib/agent-onboarding'
import type { AgentOnboardingResult, DiscoveredBabylon } from './types/agent-config'

const logger = {
  info: (msg: string, data?: unknown, source?: string) => {
    console.log(`[${source || 'INFO'}]`, msg, data || '')
  },
  error: (msg: string, data?: unknown, source?: string) => {
    console.error(`[${source || 'ERROR'}]`, msg, data || '')
  },
  warn: (msg: string, data?: unknown, source?: string) => {
    console.warn(`[${source || 'WARN'}]`, msg, data || '')
  },
  debug: (msg: string, data?: unknown, source?: string) => {
    if (process.env.DEBUG) {
      console.log(`[${source || 'DEBUG'}]`, msg, data || '')
    }
  },
}

interface RunningAgent {
  manifest: AgentManifest
  process: ChildProcess
  onboarding: AgentOnboardingResult
  started: Date
  status: 'starting' | 'running' | 'error' | 'stopped'
}

const args = process.argv.slice(2)
const maxAgents = parseInt(args.find(arg => arg.startsWith('--max='))?.split('=')[1] || '5')
const delayMs = parseInt(args.find(arg => arg.startsWith('--delay='))?.split('=')[1] || '3000')
const autoTrade = args.includes('--auto-trade')

const MASTER_MNEMONIC = process.env.BABYLON_AGENT_MASTER_MNEMONIC || 'test test test test test test test test test test test junk'
const AGENT_SECRET = process.env.BABYLON_AGENT_SECRET || 'test-secret-' + Math.random().toString(36)

const agents: Map<string, RunningAgent> = new Map()

/**
 * Load agent manifests from config
 */
function loadManifests(): ManifestList {
  const manifestPath = join(process.cwd(), 'eliza', 'config', 'agents-manifest.json')
  const manifestData = readFileSync(manifestPath, 'utf-8')
  const manifests = JSON.parse(manifestData) as ManifestList
  return manifests.slice(0, maxAgents)
}

/**
 * Discover Babylon endpoints
 */
async function discoverBabylonGame(): Promise<DiscoveredBabylon> {
  logger.info('🔍 Getting Babylon endpoints...', undefined, 'run-all-agents')
  
  const babylon = await discoverBabylon()
  
  validateEndpoints(babylon)
  
  logger.info(`✅ Babylon endpoints configured`, {
    api: babylon.endpoints.api,
    a2a: babylon.endpoints.a2a,
    mcp: babylon.endpoints.mcp
  }, 'run-all-agents')
  
  return babylon
}

/**
 * Onboard single agent
 */
async function onboardSingleAgent(
  manifest: AgentManifest,
  babylon: DiscoveredBabylon
): Promise<AgentOnboardingResult> {
  logger.info(`🔐 Onboarding agent: ${manifest.id}...`, undefined, 'run-all-agents')
  
  const result = await onboardAgent({
    agentId: manifest.id,
    characterName: manifest.id,
    masterMnemonic: MASTER_MNEMONIC,
    derivationIndex: manifest.derivationIndex,
    agentSecret: AGENT_SECRET,
    babylon,
  })
  
  logger.info(`✅ Agent onboarded: ${manifest.id}`, {
    tokenId: result.tokenId,
    wallet: result.walletAddress,
    txHash: result.txHash
  }, 'run-all-agents')
  
  return result
}

/**
 * Spawn agent process
 */
function spawnAgentProcess(
  manifest: AgentManifest,
  onboarding: AgentOnboardingResult,
  babylon: DiscoveredBabylon,
  index: number
): ChildProcess {
  logger.info(`[${index + 1}/${maxAgents}] Starting ${manifest.id}...`, undefined, 'run-all-agents')
  
  const characterPath = join(process.cwd(), manifest.characterFile)
  const agentScriptPath = join(process.cwd(), 'src', 'eliza', 'agents', 'run-eliza-agent.ts')
  
  const processArgs = [
    agentScriptPath,
    '--character', characterPath,
    '--api-url', babylon.endpoints.api,
    '--max-trade', manifest.maxTradeSize.toString(),
  ]
  
  if (manifest.autoTrade || autoTrade) {
    processArgs.push('--auto-trade')
  }
  
  const agentProcess = spawn('bun', processArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BABYLON_AGENT_ID: manifest.id,
      BABYLON_AGENT_SECRET: AGENT_SECRET,
      BABYLON_AGENT_WALLET_ADDRESS: onboarding.walletAddress,
      BABYLON_AGENT_TOKEN_ID: onboarding.tokenId.toString(),
      BABYLON_AGENT_SESSION_TOKEN: onboarding.sessionToken,
      BABYLON_API_URL: babylon.endpoints.api,
      BABYLON_A2A_ENDPOINT: babylon.endpoints.a2a,
      BABYLON_MCP_ENDPOINT: babylon.endpoints.mcp,
      AGENT0_ENABLED: 'true',
    }
  })
  
  agentProcess.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n').filter((line: string) => line.trim())
    lines.forEach((line: string) => {
      logger.debug(`[${manifest.id}] ${line}`, undefined, 'run-all-agents')
    })
    
    if (data.toString().includes('Agent ready') || data.toString().includes('initialized')) {
      const agent = agents.get(manifest.id)!
      agent.status = 'running'
      logger.info(`${manifest.id} is running`, undefined, 'run-all-agents')
    }
  })
  
  agentProcess.stderr?.on('data', (data) => {
    logger.error(`[${manifest.id}] ERROR:`, data.toString(), 'run-all-agents')
  })
  
  agentProcess.on('error', (error) => {
    logger.error(`${manifest.id} failed to start:`, error, 'run-all-agents')
    const agent = agents.get(manifest.id)
    if (agent) {
      agent.status = 'error'
    }
  })
  
  agentProcess.on('exit', (code) => {
    if (code !== 0) {
      logger.warn(`${manifest.id} exited with code ${code}`, undefined, 'run-all-agents')
    }
    const agent = agents.get(manifest.id)
    if (agent) {
      agent.status = 'stopped'
    }
  })
  
  return agentProcess
}

/**
 * Main execution
 */
async function main() {
  logger.info('🚀 Babylon Multi-Agent Runner', undefined, 'run-all-agents')
  logger.info('Configuration:', {
    maxAgents,
    autoTrade: autoTrade ? 'ENABLED' : 'DISABLED',
    delayMs: `${delayMs}ms`,
    network: AGENT0_NETWORK
  }, 'run-all-agents')
  
  const manifests = loadManifests()
  logger.info(`📋 Loaded ${manifests.length} agent manifests`, undefined, 'run-all-agents')
  
  const babylon = await discoverBabylonGame()
  
  logger.info('🔄 Onboarding agents...', undefined, 'run-all-agents')
  
  for (let i = 0; i < manifests.length; i++) {
    const manifest = manifests[i]!
    
    const onboarding = await onboardSingleAgent(manifest, babylon)
    
    const agentProcess = spawnAgentProcess(manifest, onboarding, babylon, i)
    
    const runningAgent: RunningAgent = {
      manifest,
      process: agentProcess,
      onboarding,
      started: new Date(),
      status: 'starting'
    }
    
    agents.set(manifest.id, runningAgent)
    
    if (i < manifests.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  logger.info('✅ All agents started!', undefined, 'run-all-agents')
  logger.info(`👥 ${agents.size} agents running`, undefined, 'run-all-agents')
  logger.info('Press Ctrl+C to stop all agents', undefined, 'run-all-agents')
  
  process.on('SIGINT', () => {
    logger.info('🛑 Stopping all agents...', undefined, 'run-all-agents')
    
    let stoppedCount = 0
    agents.forEach((agent, id) => {
      if (agent.status === 'running' || agent.status === 'starting') {
        agent.process.kill('SIGTERM')
        stoppedCount++
        logger.info(`Stopped ${id}`, undefined, 'run-all-agents')
      }
    })
    
    logger.info(`✅ Stopped ${stoppedCount} agents`, undefined, 'run-all-agents')
    process.exit(0)
  })
  
  setInterval(() => {
    const running = Array.from(agents.values()).filter(a => a.status === 'running').length
    const starting = Array.from(agents.values()).filter(a => a.status === 'starting').length
    const errors = Array.from(agents.values()).filter(a => a.status === 'error').length
    const stopped = Array.from(agents.values()).filter(a => a.status === 'stopped').length
    
    logger.info(`📊 Status: ${new Date().toLocaleTimeString()}`, {
      running,
      starting,
      errors,
      stopped
    }, 'run-all-agents')
  }, 60000)
}

if (args.includes('--help') || args.includes('-h')) {
  logger.info(`
🤖 Babylon Multi-Agent Runner

Usage: bun run eliza/run-all-agents.ts [OPTIONS]

Options:
  --max=N            Maximum number of agents to start (default: 5)
  --delay=MS         Delay in milliseconds between agent starts (default: 3000)
  --auto-trade       Enable auto-trading for all agents
  --help, -h         Show this help message

Required Environment Variables:
  BABYLON_AGENT_MASTER_MNEMONIC   Master mnemonic for HD wallet derivation
  BABYLON_AGENT_SECRET            Shared secret for agent authentication
  BASE_SEPOLIA_RPC_URL            RPC URL for Base Sepolia network
  DEPLOYER_PRIVATE_KEY            Private key for gas sponsorship
  AGENT0_NETWORK                  Network: 'sepolia' or 'mainnet' (default: sepolia)

Examples:
  # Start all 5 preset agents
  bun run eliza/run-all-agents.ts

  # Start 3 agents with auto-trading
  bun run eliza/run-all-agents.ts --max=3 --auto-trade

  # Start with 5-second delay between agents
  bun run eliza/run-all-agents.ts --delay=5000
`, undefined, 'run-all-agents')
  process.exit(0)
}

main()
