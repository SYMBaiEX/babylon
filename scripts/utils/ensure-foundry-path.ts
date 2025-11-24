/**
 * Utility to ensure Foundry tools (cast, forge) are in PATH
 * Import this at the top of any script that uses Foundry commands
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export function ensureFoundryInPath(): void {
  const foundryPath = join(homedir(), '.foundry', 'bin')

  if (existsSync(foundryPath)) {
    // Only add if not already in PATH
    if (!process.env.PATH?.includes(foundryPath)) {
      process.env.PATH = `${foundryPath}:${process.env.PATH}`
    }
  }
}

// Auto-execute when imported
ensureFoundryInPath()
