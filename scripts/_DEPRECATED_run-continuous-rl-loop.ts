/**
 * DEPRECATED: This script is superseded by the AutomationPipeline
 * 
 * The continuous RL loop is now handled by:
 * 1. GitHub Actions (.github/workflows/rl-training.yml) - Automated training
 * 2. AutomationPipeline (src/lib/training/AutomationPipeline.ts) - Orchestration
 * 3. Vercel Cron (/api/cron/training-check) - Hourly scoring
 * 
 * For testing the complete system, use:
 *   bun run tsx scripts/test-rl-system.ts
 * 
 * For manual training trigger:
 *   curl -X POST http://localhost:3000/api/admin/training/trigger -d '{"force":true}'
 * 
 * Original file moved to scripts/archive/ for reference.
 */

export {};


