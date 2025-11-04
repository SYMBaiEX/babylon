/**
 * Next.js Instrumentation
 * 
 * Runs on server startup to register Babylon in Agent0 registry.
 * Only runs in Node.js runtime (not Edge).
 */

export async function register() {
  // Temporarily disabled to prevent blocking dev server
  // Re-enable when agent0-sdk is properly installed
  if (false && process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      // Dynamically import to avoid bundling issues
      const { registerBabylonGame } = await import('./src/lib/babylon-registry-init')
      
      // Register Babylon game (will skip if already registered or disabled)
      await registerBabylonGame()
    } catch (error) {
      // Don't fail startup if registration fails
      console.error('Failed to register Babylon game on startup:', error)
    }
  }
}

