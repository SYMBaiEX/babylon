#!/usr/bin/env node
/**
 * Environment Setup for Prisma CLI
 * 
 * This script ensures DATABASE_URL is set before running Prisma CLI commands.
 * It handles the Vercel Prisma integration which uses PRISMA_DATABASE_URL.
 * 
 * Usage:
 *   node prisma/setup-env.js && prisma generate
 *   node prisma/setup-env.js && prisma migrate dev
 */

// Load environment variables from .env files
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

// Check for PRISMA_DATABASE_URL (Vercel Prisma integration)
if (process.env.PRISMA_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PRISMA_DATABASE_URL;
  console.log('✓ Using PRISMA_DATABASE_URL as DATABASE_URL');
} else if (process.env.DATABASE_URL) {
  console.log('✓ Using existing DATABASE_URL');
} else {
  console.error('✗ ERROR: Neither PRISMA_DATABASE_URL nor DATABASE_URL is set');
  console.error('');
  console.error('Please set one of these environment variables:');
  console.error('  DATABASE_URL="postgresql://..."');
  console.error('  PRISMA_DATABASE_URL="prisma+postgres://..."');
  console.error('');
  process.exit(1);
}

// Verify DIRECT_DATABASE_URL for migrations
if (!process.env.DIRECT_DATABASE_URL) {
  console.warn('⚠ WARNING: DIRECT_DATABASE_URL is not set');
  console.warn('  This is required for migrations and Prisma Studio');
  console.warn('  Set it to your direct PostgreSQL connection string');
  console.warn('');
}

// Show connection info (masked)
const dbUrl = process.env.DATABASE_URL || '';
const maskedUrl = dbUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
console.log(`Database: ${maskedUrl.substring(0, 60)}...`);
console.log('');

