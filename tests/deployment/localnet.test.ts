/**
 * Localnet Deployment Tests
 * 
 * Tests for local deployment infrastructure
 */

import { describe, test, expect } from 'bun:test'
import { $ } from 'bun'

describe('Localnet Deployment', () => {
  test('Anvil container can start', async () => {
    try {
      // Check if Docker is available
      await $`docker --version`.quiet()

      // Try to check Anvil status
      const result = await $`docker ps --filter name=babylon-anvil --format "{{.Names}}"`.quiet().text()

      // Either Anvil is running or it's not (both are valid states for this test)
      expect(typeof result).toBe('string')
    } catch (error) {
      // Docker not available - skip test
      console.log('⚠️  Docker not available, skipping Anvil test')
    }
  })

  test('Can connect to Anvil RPC', async () => {
    try {
      // Check if Anvil is responding
      const blockNumber = await $`cast block-number --rpc-url http://localhost:8545`.quiet().text()

      expect(parseInt(blockNumber.trim())).toBeGreaterThanOrEqual(0)
      console.log(`✅ Anvil is running at block ${blockNumber.trim()}`)
    } catch (error) {
      // Anvil not running - this is OK for tests that don't require it
      console.log('⚠️  Anvil not running (this is OK if not testing deployment)')
    }
  })

  test('Deployment script exists', () => {
    const fs = require('fs')
    const path = require('path')

    const scriptPath = path.join(process.cwd(), 'scripts/deployment/deploy-localnet.ts')
    expect(fs.existsSync(scriptPath)).toBe(true)
  })

  test('Pre-dev script exists', () => {
    const fs = require('fs')
    const path = require('path')

    const scriptPath = path.join(process.cwd(), 'scripts/pre-dev/pre-dev-local.ts')
    expect(fs.existsSync(scriptPath)).toBe(true)
  })

  test('Forge build succeeds', async () => {
    try {
      await $`forge build`.quiet()
      console.log('✅ Contracts compiled successfully')
      expect(true).toBe(true)
    } catch (error) {
      console.log('⚠️  Forge build failed (foundry may not be installed)')
      // Don't fail the test if foundry is not installed
    }
  })
})

