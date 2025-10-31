#!/usr/bin/env bun
/**
 * Run All 30 Eliza Agents Simultaneously
 *
 * This script spawns all character agents in parallel to simulate
 * a live prediction market with multiple AI traders.
 */

import { spawn, type ChildProcess } from 'child_process'
import { readdirSync } from 'fs'
import { join } from 'path'

interface AgentProcess {
  character: string
  process: ChildProcess
  started: Date
  status: 'starting' | 'running' | 'error' | 'stopped'
}

const CHARACTERS_DIR = join(process.cwd(), 'src', 'eliza', 'characters')
const AGENT_SCRIPT = join(process.cwd(), 'src', 'eliza', 'agents', 'run-eliza-agent.ts')

// Parse command line arguments
const args = process.argv.slice(2)
const autoTrade = args.includes('--auto-trade')
const maxAgents = parseInt(args.find(arg => arg.startsWith('--max='))?.split('=')[1] || '30')
const delayMs = parseInt(args.find(arg => arg.startsWith('--delay='))?.split('=')[1] || '2000')

console.log('🤖 Babylon Multi-Agent Runner\n')
console.log(`Configuration:`)
console.log(`  Auto-trading: ${autoTrade ? 'ENABLED' : 'DISABLED'}`)
console.log(`  Max agents: ${maxAgents}`)
console.log(`  Startup delay: ${delayMs}ms between agents`)
console.log()

const agents: Map<string, AgentProcess> = new Map()
let activeCount = 0
let errorCount = 0

function getCharacterFiles(): string[] {
  try {
    const files = readdirSync(CHARACTERS_DIR)
      .filter(file => file.endsWith('.json'))
      .slice(0, maxAgents)
    return files
  } catch (error) {
    console.error('❌ Failed to read characters directory:', error)
    process.exit(1)
  }
}

function startAgent(characterFile: string, index: number): Promise<void> {
  return new Promise((resolve) => {
    const characterPath = join(CHARACTERS_DIR, characterFile)
    const characterName = characterFile.replace('.json', '')

    console.log(`[${index + 1}/${maxAgents}] Starting ${characterName}...`)

    const args = [
      AGENT_SCRIPT,
      '--character', characterPath,
    ]

    if (autoTrade) {
      args.push('--auto-trade')
    }

    const agentProcess = spawn('bun', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        BABYLON_AGENT_ID: `babylon-agent-${characterName}`,
      }
    })

    const agentInfo: AgentProcess = {
      character: characterName,
      process: agentProcess,
      started: new Date(),
      status: 'starting'
    }

    agents.set(characterName, agentInfo)

    // Handle agent output
    agentProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter((line: string) => line.trim())
      lines.forEach((line: string) => {
        console.log(`[${characterName}] ${line}`)
      })

      // Detect when agent is ready
      if (data.toString().includes('Agent started') || data.toString().includes('initialized')) {
        agentInfo.status = 'running'
        activeCount++
        console.log(`✅ ${characterName} is running (${activeCount}/${maxAgents} active)`)
      }
    })

    agentProcess.stderr?.on('data', (data) => {
      console.error(`[${characterName}] ERROR: ${data.toString()}`)
    })

    agentProcess.on('error', (error) => {
      console.error(`❌ ${characterName} failed to start:`, error)
      agentInfo.status = 'error'
      errorCount++
    })

    agentProcess.on('exit', (code) => {
      if (code !== 0) {
        console.log(`⚠️  ${characterName} exited with code ${code}`)
        agentInfo.status = 'stopped'
        activeCount = Math.max(0, activeCount - 1)
      }
    })

    // Give agent time to initialize before starting next one
    setTimeout(resolve, delayMs)
  })
}

async function main() {
  console.log('📁 Loading character files...\n')

  const characterFiles = getCharacterFiles()
  console.log(`Found ${characterFiles.length} character files:\n`)
  characterFiles.forEach((file, i) => {
    console.log(`  ${i + 1}. ${file.replace('.json', '')}`)
  })
  console.log()

  console.log('🚀 Starting agents...\n')
  console.log('⏱️  Starting agents with 2-second delay between each\n')

  // Start agents sequentially with delay
  for (let i = 0; i < characterFiles.length; i++) {
    await startAgent(characterFiles[i], i)
  }

  console.log('\n✅ All agents started!\n')
  console.log('📊 Status:')
  console.log(`   Active: ${activeCount}`)
  console.log(`   Errors: ${errorCount}`)
  console.log()
  console.log('💡 Press Ctrl+C to stop all agents\n')

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Stopping all agents...\n')

    let stoppedCount = 0
    agents.forEach((agent, name) => {
      if (agent.status === 'running' || agent.status === 'starting') {
        agent.process.kill('SIGTERM')
        stoppedCount++
        console.log(`   Stopped ${name}`)
      }
    })

    console.log(`\n✅ Stopped ${stoppedCount} agents\n`)
    process.exit(0)
  })

  // Keep process running and show periodic status
  setInterval(() => {
    const running = Array.from(agents.values()).filter(a => a.status === 'running').length
    const starting = Array.from(agents.values()).filter(a => a.status === 'starting').length
    const errors = Array.from(agents.values()).filter(a => a.status === 'error').length
    const stopped = Array.from(agents.values()).filter(a => a.status === 'stopped').length

    console.log(`\n📊 Status Update: ${new Date().toLocaleTimeString()}`)
    console.log(`   Running: ${running}`)
    console.log(`   Starting: ${starting}`)
    console.log(`   Errors: ${errors}`)
    console.log(`   Stopped: ${stopped}`)
  }, 60000) // Every minute
}

// Show usage if --help flag is passed
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: bun run scripts/run-all-agents.ts [OPTIONS]

Options:
  --auto-trade       Enable auto-trading for all agents
  --max=N            Maximum number of agents to start (default: 30)
  --delay=MS         Delay in milliseconds between agent starts (default: 2000)
  --help, -h         Show this help message

Examples:
  # Start all 30 agents in observer mode
  bun run scripts/run-all-agents.ts

  # Start all 30 agents with auto-trading enabled
  bun run scripts/run-all-agents.ts --auto-trade

  # Start only 10 agents
  bun run scripts/run-all-agents.ts --max=10

  # Start agents with 5-second delay between each
  bun run scripts/run-all-agents.ts --delay=5000

  # Combine options
  bun run scripts/run-all-agents.ts --auto-trade --max=15 --delay=3000

Environment Variables:
  OPENAI_API_KEY              Required - OpenAI API key for all agents
  BABYLON_API_URL             Optional - Babylon API URL (default: http://localhost:3000)
  BABYLON_AGENT_SECRET        Optional - Shared secret for agent authentication

Note: Make sure the Babylon game engine is running first:
  bun run daemon
`)
  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
