#!/usr/bin/env bun

/**
 * Post-install script to install Python dependencies for agent examples
 * Ensures Python agents can run after npm/bun install
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const PYTHON_AGENT_DIR = join(
  process.cwd(),
  'examples/babylon-langgraph-agent'
);

async function checkPythonInstalled(): Promise<boolean> {
  try {
    execSync('python3 --version', { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execSync('python --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

async function checkUvInstalled(): Promise<boolean> {
  try {
    execSync('uv --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function installPythonDeps(): Promise<void> {
  console.log('🐍 Checking Python agent dependencies...');

  if (!existsSync(PYTHON_AGENT_DIR)) {
    console.log('   ⏭️  Python agent directory not found, skipping');
    return;
  }

  const hasPython = await checkPythonInstalled();
  if (!hasPython) {
    console.log(
      '   ⚠️  Python not found, skipping Python dependency installation'
    );
    console.log('   💡 Install Python 3.11+ to use Python agents');
    return;
  }

  const hasUv = await checkUvInstalled();
  if (!hasUv) {
    console.log('   ⚠️  uv not found, skipping Python dependency installation');
    console.log(
      '   💡 Install uv (https://github.com/astral-sh/uv) to use Python agents'
    );
    return;
  }

  try {
    console.log('   📦 Installing Python dependencies with uv...');
    execSync('uv sync --prerelease=allow', {
      cwd: PYTHON_AGENT_DIR,
      stdio: 'inherit',
    });
    console.log('   ✅ Python dependencies installed');
  } catch (error) {
    console.log('   ⚠️  Failed to install Python dependencies:', error);
    console.log(
      '   💡 Run manually: cd examples/babylon-langgraph-agent && uv sync --prerelease=allow'
    );
  }
}

installPythonDeps().catch((error) => {
  console.error('Error installing Python dependencies:', error);
  process.exit(1);
});
