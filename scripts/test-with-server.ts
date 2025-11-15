#!/usr/bin/env bun

/**
 * Test Runner with Server Management
 * 
 * This script:
 * 1. Checks if the server is running on port 3000
 * 2. If not, builds the project and starts `bun run start` in the background
 * 3. Waits for the server to be ready
 * 4. Runs the tests
 * 5. Shuts down the server if we started it (kills entire process tree)
 */

const SERVER_URL = 'http://localhost:3000'
const HEALTH_ENDPOINT = `${SERVER_URL}/api/health`
const MAX_WAIT_TIME = 120000 // 2 minutes
const CHECK_INTERVAL = 2000 // 2 seconds

let serverProcess: ReturnType<typeof Bun.spawn> | null = null
let serverPid: number | null = null
let serverStartedByUs = false

/**
 * Check if port 3000 is in use
 */
async function isPortInUse(): Promise<boolean> {
  try {
    const lsofProcess = Bun.spawn(['lsof', '-ti:3000'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    
    const output = await new Response(lsofProcess.stdout).text()
    const pids = output.trim().split('\n').filter(Boolean)
    
    // If we found any PIDs, port is in use
    return pids.length > 0
  } catch {
    // lsof might not be available, fall back to HTTP check
    return false
  }
}

/**
 * Check if the server is running by hitting both health endpoint and root URL
 * Tests check the root URL, so we need to verify both are working
 */
async function isServerRunning(): Promise<boolean> {
  try {
    // Check health endpoint first (more reliable)
    const healthResponse = await fetch(HEALTH_ENDPOINT, {
      signal: AbortSignal.timeout(5000),
    })
    if (!healthResponse.ok) return false
    
    // Also check root URL since that's what tests check
    const rootResponse = await fetch(SERVER_URL, {
      signal: AbortSignal.timeout(5000),
    })
    return rootResponse.status < 500
  } catch {
    return false
  }
}

/**
 * Wait for the server to be ready and stable
 * Does multiple checks to ensure the server is fully initialized
 */
async function waitForServer(): Promise<void> {
  const startTime = Date.now()
  let consecutiveSuccesses = 0
  const REQUIRED_SUCCESSES = 3 // Need 3 consecutive successful checks
  
  while (Date.now() - startTime < MAX_WAIT_TIME) {
    if (await isServerRunning()) {
      consecutiveSuccesses++
      if (consecutiveSuccesses >= REQUIRED_SUCCESSES) {
        // Server is stable, add a small buffer for full initialization
        console.log('✅ Server is ready and stable')
        await new Promise(resolve => setTimeout(resolve, 1000)) // 1 second buffer
        return
      }
      process.stdout.write('.')
    } else {
      consecutiveSuccesses = 0 // Reset on failure
      process.stdout.write('.')
    }
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL))
  }
  
  throw new Error(`Server failed to start after ${MAX_WAIT_TIME / 1000} seconds`)
}

/**
 * Build the project
 */
async function buildProject(): Promise<void> {
  console.log('🔨 Building project...')
  
  const buildProcess = Bun.spawn(['bun', 'run', 'build'], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env },
  })
  
  const exitCode = await buildProcess.exited
  
  if (exitCode !== 0) {
    throw new Error(`Build failed with exit code ${exitCode}`)
  }
  
  console.log('✅ Build complete')
}

/**
 * Start the production server in the background
 */
function startServer(): void {
  console.log('🚀 Starting production server...')
  
  serverProcess = Bun.spawn(['bun', 'run', 'start'], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  })
  
  // Get the PID of the spawned process
  serverPid = serverProcess.pid || null
  
  serverStartedByUs = true
  
  if (serverPid) {
    console.log(`   Server PID: ${serverPid}`)
  }
}

/**
 * Find all child processes of a given PID
 */
async function findChildProcesses(parentPid: number): Promise<number[]> {
  const children: number[] = []
  
  try {
    // Use ps to find all processes with this parent PID
    const psProcess = Bun.spawn(['ps', '-o', 'pid', '--ppid', parentPid.toString(), '--no-headers'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    
    const output = await new Response(psProcess.stdout).text()
    const pids = output.trim().split('\n').filter(Boolean).map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p))
    
    // Recursively find children of children
    for (const pid of pids) {
      children.push(pid)
      const grandchildren = await findChildProcesses(pid)
      children.push(...grandchildren)
    }
  } catch {
    // ps might not be available or no children found
  }
  
  return children
}

/**
 * Kill a process and all its children (process tree)
 */
async function killProcessTree(pid: number): Promise<void> {
  try {
    // Find all child processes recursively
    const children = await findChildProcesses(pid)
    
    // Kill all children first (bottom-up)
    for (const childPid of children.reverse()) {
      try {
        process.kill(childPid, 'SIGTERM')
      } catch {
        // Process might already be dead
      }
    }
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Force kill children if still running
    for (const childPid of children) {
      try {
        process.kill(childPid, 'SIGKILL')
      } catch {
        // Process might already be dead
      }
    }
    
    // Finally kill the parent process
    try {
      process.kill(pid, 'SIGTERM')
      await new Promise(resolve => setTimeout(resolve, 1000))
      process.kill(pid, 'SIGKILL')
    } catch {
      // Process might already be dead
    }
  } catch (error) {
    // Fallback: try direct kill
    try {
      process.kill(pid, 'SIGTERM')
      await new Promise(resolve => setTimeout(resolve, 1000))
      process.kill(pid, 'SIGKILL')
    } catch {
      // Process might already be dead
    }
  }
}

/**
 * Stop the server if we started it
 */
async function stopServer(): Promise<void> {
  if (serverStartedByUs) {
    console.log('\n🛑 Stopping server...')
    
    try {
      // Kill via Bun.spawn process handle
      if (serverProcess) {
        serverProcess.kill()
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        if (!serverProcess.killed && serverPid) {
          await killProcessTree(serverPid)
        }
      } else if (serverPid) {
        // Fallback: kill by PID if we have it
        await killProcessTree(serverPid)
      }
      
      // Also kill any processes on port 3000 as a safety measure
      try {
        const lsofProcess = Bun.spawn(['lsof', '-ti:3000'], {
          stdout: 'pipe',
          stderr: 'pipe',
        })
        
        const output = await new Response(lsofProcess.stdout).text()
        const pids = output.trim().split('\n').filter(Boolean)
        
        for (const pid of pids) {
          const pidNum = parseInt(pid, 10)
          if (!isNaN(pidNum) && pidNum !== process.pid) {
            try {
              process.kill(pidNum, 'SIGTERM')
            } catch {
              // Process might already be dead
            }
          }
        }
        
        // Wait and force kill
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        for (const pid of pids) {
          const pidNum = parseInt(pid, 10)
          if (!isNaN(pidNum) && pidNum !== process.pid) {
            try {
              process.kill(pidNum, 'SIGKILL')
            } catch {
              // Process might already be dead
            }
          }
        }
      } catch {
        // lsof might not be available or no processes found
      }
      
      console.log('✅ Server stopped')
    } catch (error) {
      console.error('⚠️  Error stopping server:', error)
    }
    
    // Reset state
    serverProcess = null
    serverPid = null
    serverStartedByUs = false
  }
}

/**
 * Run the tests
 */
async function runTests(): Promise<number> {
  const testArgs = process.argv.slice(2)
  
  // Default test command if no args provided
  const defaultTestArgs = [
    'tests/unit/',
    'tests/integration/',
    'tests/deployment/',
    'tests/markets-pnl-sharing.test.ts',
    'src/lib/__tests__/',
  ]
  
  const args = testArgs.length > 0 ? testArgs : defaultTestArgs
  
  console.log('🧪 Running tests...')
  console.log(`   Command: bun test ${args.join(' ')}`)
  
  const testProcess = Bun.spawn(['bun', 'test', ...args], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env },
  })
  
  const exitCode = await testProcess.exited
  
  return exitCode
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    // Check if port 3000 is in use first (faster check)
    console.log('🔍 Checking if server is running...')
    const portInUse = await isPortInUse()
    const serverRunning = await isServerRunning()
    
    if (portInUse || serverRunning) {
      if (portInUse && !serverRunning) {
        console.log('⚠️  Port 3000 is in use but server is not responding yet')
        console.log('⏳ Waiting for server to become ready...')
        await waitForServer()
      } else {
        console.log('✅ Server is already running')
        // Verify it's stable even if already running
        console.log('⏳ Verifying server stability...')
        await waitForServer()
      }
      // Skip build if server is already running
      console.log('⏭️  Skipping build (server already running)')
    } else {
      console.log('⚠️  Server is not running')
      
      // Build first
      await buildProject()
      
      // Then start server
      startServer()
      console.log('⏳ Waiting for server to start...')
      await waitForServer()
    }
    
    // Set environment variable to indicate server should be available
    // This helps tests that check at module load time
    process.env.TEST_SERVER_AVAILABLE = 'true'
    process.env.TEST_API_URL = SERVER_URL
    
    // Run tests
    const exitCode = await runTests()
    
    // Stop server if we started it
    await stopServer()
    
    // Exit with the test exit code
    process.exit(exitCode)
  } catch (error) {
    console.error('❌ Error:', error)
    await stopServer()
    process.exit(1)
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⚠️  Received SIGINT, cleaning up...')
  await stopServer()
  process.exit(1)
})

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Received SIGTERM, cleaning up...')
  await stopServer()
  process.exit(1)
})

// Run main function
main()

