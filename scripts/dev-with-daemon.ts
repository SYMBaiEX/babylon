#!/usr/bin/env bun
/**
 * Development Script with Daemon
 * 
 * Runs both Next.js dev server AND game engine daemon in one command.
 * Use this instead of separate terminals in local development.
 * 
 * Usage:
 *   bun run dev:full        (both web + daemon)
 *   bun run dev             (just web, no daemon)
 *   bun run daemon          (just daemon, no web)
 */

import { spawn, type ChildProcess } from 'child_process';
import { logger } from '../src/lib/logger';

let nextProcess: ChildProcess | null = null;
let daemonProcess: ChildProcess | null = null;

async function startNext() {
  logger.info('Starting Next.js dev server...', undefined, 'Dev');
  
  nextProcess = spawn('bun', ['run', 'scripts/pre-dev.ts'], {
    stdio: 'inherit',
    shell: true,
  });

  return new Promise<void>((resolve) => {
    nextProcess?.on('exit', (code) => {
      if (code === 0) {
        // pre-dev succeeded, now start Next.js
        nextProcess = spawn('bun', ['x', 'next', 'dev'], {
          stdio: 'inherit',
          shell: true,
        });
        resolve();
      }
    });
  });
}

async function startDaemon() {
  logger.info('Waiting 5 seconds before starting daemon...', undefined, 'Dev');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  logger.info('Starting game engine daemon...', undefined, 'Dev');
  
  daemonProcess = spawn('bun', ['run', 'src/cli/realtime-daemon.ts'], {
    stdio: 'inherit',
    shell: true,
  });
}

async function main() {
  logger.info('🎮 BABYLON DEVELOPMENT MODE (Web + Daemon)', undefined, 'Dev');
  logger.info('==========================================', undefined, 'Dev');
  logger.info('Starting both Next.js and game engine...', undefined, 'Dev');
  logger.info('Press Ctrl+C to stop both processes', undefined, 'Dev');
  logger.info('', undefined, 'Dev');

  // Handle shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down...', undefined, 'Dev');
    
    if (nextProcess) {
      logger.info('Stopping Next.js...', undefined, 'Dev');
      nextProcess.kill('SIGTERM');
    }
    
    if (daemonProcess) {
      logger.info('Stopping daemon...', undefined, 'Dev');
      daemonProcess.kill('SIGTERM');
    }
    
    process.exit(0);
  });

  // Start both processes
  await startNext();
  await startDaemon();

  // Keep alive
  await new Promise(() => {});
}

main().catch((error) => {
  logger.error('Fatal error:', error, 'Dev');
  process.exit(1);
});

