#!/usr/bin/env node
/**
 * Check whether an Ethereum address is derivable from a BIP39 seed phrase
 * on a given derivation path (default: MetaMask m/44'/60'/0'/0/{index}).
 *
 * SECURITY:
 * - Do NOT paste your Secret Recovery Phrase (SRP) into chat or commit it.
 * - Prefer providing the SRP via stdin to avoid shell history:
 *     printf '%s\n' "word1 word2 ... word12" | node scripts/check-eth-derived-address.mjs 0xYourAddr
 */
import { readFileSync } from 'node:fs';
import { stdin as stdinStream } from 'node:process';
import readline from 'node:readline/promises';
import { ethers } from 'ethers';

// =============================
// USER CONFIG (local only)
// =============================
// WARNING: putting your SRP in a file is risky. Do not commit it.
// Prefer leaving `SRP` empty and using stdin/env instead.
const TARGET_ADDRESS = '0x39d323A16a7618D6604941704560b26dF71b4C40'; // e.g. '0x39d323A16a7618D6604941704560b26dF71b4C40'
const SRP = ''; // e.g. 'word1 word2 ... word12' (or 24 words)

function parseArgs(argv) {
  const out = {
    address: undefined,
    max: 500,
    start: 0,
    path: "m/44'/60'/0'/0",
    help: false,
  };

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (a === '--max') {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v < 0)
        throw new Error('--max must be a number >= 0');
      out.max = Math.floor(v);
      continue;
    }
    if (a === '--start') {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v < 0)
        throw new Error('--start must be a number >= 0');
      out.start = Math.floor(v);
      continue;
    }
    if (a === '--path') {
      const v = args[++i];
      if (!v) throw new Error('--path requires a value');
      out.path = v;
      continue;
    }
    if (a.startsWith('-')) {
      throw new Error(`Unknown option: ${a}`);
    }
    if (!out.address) {
      out.address = a;
      continue;
    }
    throw new Error(`Unexpected extra argument: ${a}`);
  }

  return out;
}

function usage() {
  return [
    'Usage:',
    "  node scripts/check-eth-derived-address.mjs <address> [--start N] [--max N] [--path \"m/44'/60'/0'/0\"]",
    '',
    'Examples:',
    '  # Provide SRP via stdin (recommended):',
    '  printf \'%s\\n\' "word1 word2 ..." | node scripts/check-eth-derived-address.mjs 0x39d323A16a7618D6604941704560b26dF71b4C40',
    '',
    '  # Or via env var (may end up in shell history):',
    '  SRP="word1 word2 ..." node scripts/check-eth-derived-address.mjs 0x39d323A16a7618D6604941704560b26dF71b4C40 --max 2000',
    '',
    'Notes:',
    "  - Default MetaMask path: m/44'/60'/0'/0/{index}",
    '  - If not found, it may be from another seed, another path, or an index > max.',
  ].join('\n');
}

async function readPhrase() {
  if (SRP && SRP.trim()) return SRP.trim();
  if (process.env.SRP && process.env.SRP.trim()) return process.env.SRP.trim();

  // If piped, read stdin.
  if (!stdinStream.isTTY) {
    const raw = readFileSync(0, 'utf8').trim();
    if (raw) return raw;
  }

  // Interactive prompt (will echo input).
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const ans = await rl.question(
      'Paste your SRP (words separated by spaces), then press Enter: '
    );
    return ans.trim();
  } finally {
    rl.close();
  }
}

function normalizeAddress(addr) {
  try {
    return ethers.getAddress(addr);
  } catch {
    throw new Error(`Invalid Ethereum address: ${addr}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const address = args.address ?? TARGET_ADDRESS;
  if (args.help || !address) {
    console.log(usage());
    process.exit(args.help ? 0 : 2);
  }

  const target = normalizeAddress(address).toLowerCase();
  const phrase = await readPhrase();
  if (!phrase)
    throw new Error(
      'No SRP provided (set SRP env var, pipe via stdin, or paste when prompted).'
    );

  const basePath = args.path.replace(/\/+$/, '');
  const start = args.start;
  const end = args.max;
  if (start > end) throw new Error('--start must be <= --max');

  for (let i = start; i <= end; i++) {
    const fullPath = `${basePath}/${i}`;
    const wallet = ethers.HDNodeWallet.fromPhrase(phrase, undefined, fullPath);
    if (wallet.address.toLowerCase() === target) {
      console.log(`FOUND: ${wallet.address}`);
      console.log(`path:  ${fullPath}`);
      console.log(`index: ${i}`);
      return;
    }
  }

  console.log(
    `NOT FOUND in ${basePath}/{${start}..${end}} for ${ethers.getAddress(address)}`
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err?.message ?? String(err));
  process.exit(1);
});
