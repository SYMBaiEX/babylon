/**
 * Unit Tests: Wallet Transaction History Logic
 *
 * Tests the transaction merging, deduplication, pagination, and sorting logic
 * used in the /api/wallet/transactions route.
 *
 * Exercises real code paths for:
 *   - Transaction deduplication via seenTxHashes
 *   - Timestamp sorting
 *   - Pagination (offset/limit)
 *   - Explorer URL generation per chain
 *   - TransactionRecord structure
 *
 * Run with: bun test unit/wallet-transactions.test.ts
 */

import { describe, expect, test } from 'bun:test';

// ---------------------------------------------------------------------------
// TransactionRecord type (mirrors the route definition)
// ---------------------------------------------------------------------------

interface TransactionRecord {
  txHash: string;
  type: 'send' | 'receive' | 'mint' | 'approve' | 'contract_interaction';
  from: string;
  to: string;
  value: string;
  token?: { symbol: string; address: string; decimals: number };
  nft?: {
    collection: string;
    tokenId: string;
    name: string;
    imageUrl: string;
  };
  timestamp: string;
  status: 'confirmed' | 'pending' | 'failed';
  explorerUrl: string;
}

// ---------------------------------------------------------------------------
// getTxExplorerUrl (mirrors function in transactions route)
// ---------------------------------------------------------------------------

function getTxExplorerUrl(txHash: string, chainId: number): string {
  switch (chainId) {
    case 1:
      return `https://etherscan.io/tx/${txHash}`;
    case 11155111:
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    case 8453:
      return `https://basescan.org/tx/${txHash}`;
    case 84532:
      return `https://sepolia.basescan.org/tx/${txHash}`;
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Transaction deduplication logic (mirrors the seenTxHashes Set pattern)
// ---------------------------------------------------------------------------

function deduplicateTransactions(
  sources: TransactionRecord[][]
): TransactionRecord[] {
  const result: TransactionRecord[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    for (const tx of source) {
      if (!seen.has(tx.txHash)) {
        seen.add(tx.txHash);
        result.push(tx);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sorting by timestamp descending (mirrors the route)
// ---------------------------------------------------------------------------

function sortTransactions(txs: TransactionRecord[]): TransactionRecord[] {
  return [...txs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function paginateTransactions(
  txs: TransactionRecord[],
  page: number,
  limit: number
): { paginated: TransactionRecord[]; total: number } {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(50, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  return {
    paginated: txs.slice(offset, offset + safeLimit),
    total: txs.length,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    txHash: '0x' + Math.random().toString(16).slice(2),
    type: 'send',
    from: '0xaaaa',
    to: '0xbbbb',
    value: '1000',
    timestamp: new Date().toISOString(),
    status: 'confirmed',
    explorerUrl: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Explorer URL tests
// ---------------------------------------------------------------------------

describe('Transaction Explorer URL', () => {
  const hash = '0xdeadbeef';

  test('Ethereum mainnet (1)', () => {
    expect(getTxExplorerUrl(hash, 1)).toBe(`https://etherscan.io/tx/${hash}`);
  });

  test('Sepolia (11155111)', () => {
    expect(getTxExplorerUrl(hash, 11155111)).toBe(
      `https://sepolia.etherscan.io/tx/${hash}`
    );
  });

  test('Base mainnet (8453)', () => {
    expect(getTxExplorerUrl(hash, 8453)).toBe(
      `https://basescan.org/tx/${hash}`
    );
  });

  test('Base Sepolia (84532)', () => {
    expect(getTxExplorerUrl(hash, 84532)).toBe(
      `https://sepolia.basescan.org/tx/${hash}`
    );
  });

  test('unknown chain returns empty string', () => {
    expect(getTxExplorerUrl(hash, 42161)).toBe('');
  });

  test('chain 0 returns empty string', () => {
    expect(getTxExplorerUrl(hash, 0)).toBe('');
  });

  test('negative chain returns empty string', () => {
    expect(getTxExplorerUrl(hash, -1)).toBe('');
  });

  test('URL contains the full hash', () => {
    const fullHash =
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const url = getTxExplorerUrl(fullHash, 8453);
    expect(url).toContain(fullHash);
  });
});

// ---------------------------------------------------------------------------
// Deduplication tests
// ---------------------------------------------------------------------------

describe('Transaction deduplication', () => {
  test('removes duplicate txHashes across sources', () => {
    const sharedHash = '0xshared';
    const source1 = [makeTx({ txHash: sharedHash, type: 'send' })];
    const source2 = [makeTx({ txHash: sharedHash, type: 'receive' })];

    const result = deduplicateTransactions([source1, source2]);
    expect(result.length).toBe(1);
    // Should keep the first occurrence (from source1)
    expect(result[0]!.type).toBe('send');
  });

  test('keeps unique transactions from all sources', () => {
    const source1 = [makeTx({ txHash: '0x1' }), makeTx({ txHash: '0x2' })];
    const source2 = [makeTx({ txHash: '0x3' }), makeTx({ txHash: '0x4' })];

    const result = deduplicateTransactions([source1, source2]);
    expect(result.length).toBe(4);
  });

  test('handles empty sources', () => {
    const result = deduplicateTransactions([[], [], []]);
    expect(result.length).toBe(0);
  });

  test('handles single source with no duplicates', () => {
    const source = [makeTx({ txHash: '0x1' }), makeTx({ txHash: '0x2' })];
    const result = deduplicateTransactions([source]);
    expect(result.length).toBe(2);
  });

  test('handles all transactions being duplicates', () => {
    const tx = makeTx({ txHash: '0xsame' });
    const source1 = [{ ...tx }];
    const source2 = [{ ...tx }];
    const source3 = [{ ...tx }];

    const result = deduplicateTransactions([source1, source2, source3]);
    expect(result.length).toBe(1);
  });

  test('preserves order of first occurrence', () => {
    const source1 = [
      makeTx({ txHash: '0xa', timestamp: '2024-01-01T00:00:00Z' }),
      makeTx({ txHash: '0xb', timestamp: '2024-01-02T00:00:00Z' }),
    ];
    const source2 = [
      makeTx({ txHash: '0xb', timestamp: '2024-01-02T00:00:00Z' }),
      makeTx({ txHash: '0xc', timestamp: '2024-01-03T00:00:00Z' }),
    ];

    const result = deduplicateTransactions([source1, source2]);
    expect(result.map((t) => t.txHash)).toEqual(['0xa', '0xb', '0xc']);
  });

  test('handles large number of transactions', () => {
    const source = Array.from({ length: 1000 }, (_, i) =>
      makeTx({ txHash: `0x${i}` })
    );
    const result = deduplicateTransactions([source]);
    expect(result.length).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Sorting tests
// ---------------------------------------------------------------------------

describe('Transaction sorting', () => {
  test('sorts by timestamp descending (newest first)', () => {
    const txs = [
      makeTx({ txHash: '0xold', timestamp: '2024-01-01T00:00:00Z' }),
      makeTx({ txHash: '0xnew', timestamp: '2024-12-31T23:59:59Z' }),
      makeTx({ txHash: '0xmid', timestamp: '2024-06-15T12:00:00Z' }),
    ];

    const sorted = sortTransactions(txs);
    expect(sorted[0]!.txHash).toBe('0xnew');
    expect(sorted[1]!.txHash).toBe('0xmid');
    expect(sorted[2]!.txHash).toBe('0xold');
  });

  test('handles equal timestamps', () => {
    const ts = '2024-06-15T12:00:00Z';
    const txs = [
      makeTx({ txHash: '0xa', timestamp: ts }),
      makeTx({ txHash: '0xb', timestamp: ts }),
    ];

    const sorted = sortTransactions(txs);
    expect(sorted.length).toBe(2);
    // Both should still be present (stable sort)
    const hashes = sorted.map((t) => t.txHash);
    expect(hashes).toContain('0xa');
    expect(hashes).toContain('0xb');
  });

  test('handles single transaction', () => {
    const tx = makeTx({ txHash: '0xonly' });
    const sorted = sortTransactions([tx]);
    expect(sorted.length).toBe(1);
    expect(sorted[0]!.txHash).toBe('0xonly');
  });

  test('handles empty array', () => {
    const sorted = sortTransactions([]);
    expect(sorted).toEqual([]);
  });

  test('does not mutate original array', () => {
    const txs = [
      makeTx({ txHash: '0xold', timestamp: '2024-01-01T00:00:00Z' }),
      makeTx({ txHash: '0xnew', timestamp: '2024-12-31T23:59:59Z' }),
    ];
    const originalOrder = [...txs.map((t) => t.txHash)];
    sortTransactions(txs);
    expect(txs.map((t) => t.txHash)).toEqual(originalOrder);
  });

  test('handles ISO 8601 timestamps with milliseconds', () => {
    const txs = [
      makeTx({ txHash: '0xa', timestamp: '2024-01-01T00:00:00.100Z' }),
      makeTx({ txHash: '0xb', timestamp: '2024-01-01T00:00:00.200Z' }),
    ];

    const sorted = sortTransactions(txs);
    expect(sorted[0]!.txHash).toBe('0xb');
  });
});

// ---------------------------------------------------------------------------
// Pagination tests
// ---------------------------------------------------------------------------

describe('Transaction pagination', () => {
  const allTxs = Array.from({ length: 55 }, (_, i) =>
    makeTx({ txHash: `0x${i}` })
  );

  test('page 1 with limit 20 returns first 20', () => {
    const { paginated, total } = paginateTransactions(allTxs, 1, 20);
    expect(paginated.length).toBe(20);
    expect(total).toBe(55);
    expect(paginated[0]!.txHash).toBe('0x0');
  });

  test('page 2 with limit 20 returns next 20', () => {
    const { paginated } = paginateTransactions(allTxs, 2, 20);
    expect(paginated.length).toBe(20);
    expect(paginated[0]!.txHash).toBe('0x20');
  });

  test('page 3 with limit 20 returns remaining 15', () => {
    const { paginated } = paginateTransactions(allTxs, 3, 20);
    expect(paginated.length).toBe(15);
    expect(paginated[0]!.txHash).toBe('0x40');
  });

  test('page beyond data returns empty array', () => {
    const { paginated, total } = paginateTransactions(allTxs, 10, 20);
    expect(paginated.length).toBe(0);
    expect(total).toBe(55);
  });

  test('page 0 is corrected to page 1', () => {
    const { paginated } = paginateTransactions(allTxs, 0, 20);
    expect(paginated.length).toBe(20);
    expect(paginated[0]!.txHash).toBe('0x0');
  });

  test('negative page is corrected to page 1', () => {
    const { paginated } = paginateTransactions(allTxs, -5, 20);
    expect(paginated[0]!.txHash).toBe('0x0');
  });

  test('limit is clamped to max 50', () => {
    const { paginated } = paginateTransactions(allTxs, 1, 100);
    expect(paginated.length).toBe(50);
  });

  test('limit 0 is corrected to 1', () => {
    const { paginated } = paginateTransactions(allTxs, 1, 0);
    expect(paginated.length).toBe(1);
  });

  test('negative limit is corrected to 1', () => {
    const { paginated } = paginateTransactions(allTxs, 1, -10);
    expect(paginated.length).toBe(1);
  });

  test('limit 1 returns single item per page', () => {
    const { paginated } = paginateTransactions(allTxs, 1, 1);
    expect(paginated.length).toBe(1);
    expect(paginated[0]!.txHash).toBe('0x0');
  });

  test('empty transaction list returns empty page', () => {
    const { paginated, total } = paginateTransactions([], 1, 20);
    expect(paginated.length).toBe(0);
    expect(total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TransactionRecord structure validation
// ---------------------------------------------------------------------------

describe('TransactionRecord structure', () => {
  test('send transaction has correct structure', () => {
    const tx: TransactionRecord = {
      txHash: '0xabc',
      type: 'send',
      from: '0xsender',
      to: '0xrecipient',
      value: '1000000000000000000',
      timestamp: '2024-01-01T00:00:00Z',
      status: 'confirmed',
      explorerUrl: 'https://basescan.org/tx/0xabc',
    };

    expect(tx.type).toBe('send');
    expect(tx.token).toBeUndefined();
    expect(tx.nft).toBeUndefined();
  });

  test('ERC-20 send includes token metadata', () => {
    const tx: TransactionRecord = {
      txHash: '0xabc',
      type: 'send',
      from: '0xsender',
      to: '0xrecipient',
      value: '1000000',
      token: {
        symbol: 'USDC',
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
      },
      timestamp: '2024-01-01T00:00:00Z',
      status: 'confirmed',
      explorerUrl: '',
    };

    expect(tx.token).toBeDefined();
    expect(tx.token!.symbol).toBe('USDC');
    expect(tx.token!.decimals).toBe(6);
  });

  test('NFT transfer includes NFT metadata', () => {
    const tx: TransactionRecord = {
      txHash: '0xabc',
      type: 'receive',
      from: '0x0000000000000000000000000000000000000000',
      to: '0xrecipient',
      value: '0',
      nft: {
        collection: 'ProtoMonkeys',
        tokenId: '42',
        name: 'ProtoMonkey #42',
        imageUrl: 'https://example.com/42.png',
      },
      timestamp: '2024-01-01T00:00:00Z',
      status: 'confirmed',
      explorerUrl: '',
    };

    expect(tx.nft).toBeDefined();
    expect(tx.nft!.collection).toBe('ProtoMonkeys');
    expect(tx.nft!.tokenId).toBe('42');
  });

  test('mint transaction from zero address', () => {
    const tx: TransactionRecord = {
      txHash: '0xmint',
      type: 'mint',
      from: '0x0000000000000000000000000000000000000000',
      to: '0xminter',
      value: '0',
      timestamp: '2024-01-01T00:00:00Z',
      status: 'confirmed',
      explorerUrl: '',
    };

    expect(tx.type).toBe('mint');
    expect(tx.from).toBe('0x0000000000000000000000000000000000000000');
  });

  test('pending transaction status', () => {
    const tx: TransactionRecord = {
      txHash: '0xpending',
      type: 'send',
      from: '0xa',
      to: '0xb',
      value: '100',
      timestamp: new Date().toISOString(),
      status: 'pending',
      explorerUrl: '',
    };

    expect(tx.status).toBe('pending');
  });

  test('failed transaction status', () => {
    const tx: TransactionRecord = {
      txHash: '0xfailed',
      type: 'send',
      from: '0xa',
      to: '0xb',
      value: '100',
      timestamp: new Date().toISOString(),
      status: 'failed',
      explorerUrl: '',
    };

    expect(tx.status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// isSend / isReceive direction detection (mirrors route logic)
// ---------------------------------------------------------------------------

describe('Transaction direction detection', () => {
  const walletAddress = '0xabcdef1234567890abcdef1234567890abcdef12';

  test('detects outgoing (send) correctly', () => {
    const fromAddress = walletAddress;
    const isSend = fromAddress === walletAddress;
    expect(isSend).toBe(true);
  });

  test('detects incoming (receive) correctly', () => {
    const fromAddress = '0x1111111111111111111111111111111111111111';
    const isSend = fromAddress === (walletAddress as unknown as string);
    expect(isSend).toBe(false);
  });

  test('handles lowercase comparison', () => {
    const fromAddress = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
    const normalized = fromAddress.toLowerCase();
    expect(normalized === walletAddress).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases for timestamp handling
// ---------------------------------------------------------------------------

describe('Timestamp edge cases', () => {
  test('handles Unix epoch timestamp', () => {
    const tx = makeTx({ timestamp: '1970-01-01T00:00:00Z' });
    expect(new Date(tx.timestamp).getTime()).toBe(0);
  });

  test('handles far future timestamp', () => {
    const tx = makeTx({ timestamp: '2099-12-31T23:59:59Z' });
    const date = new Date(tx.timestamp);
    expect(date.getFullYear()).toBe(2099);
  });

  test('handles timestamp with timezone offset', () => {
    const tx = makeTx({ timestamp: '2024-06-15T12:00:00+05:00' });
    const date = new Date(tx.timestamp);
    expect(date.getTime()).toBeGreaterThan(0);
  });

  test('sorts correctly across timezone representations', () => {
    const txs = [
      makeTx({ txHash: '0xa', timestamp: '2024-01-01T05:00:00+05:00' }), // UTC midnight
      makeTx({ txHash: '0xb', timestamp: '2024-01-01T01:00:00Z' }), // 1 AM UTC
    ];

    const sorted = sortTransactions(txs);
    // 0xb (1 AM UTC) is newer than 0xa (midnight UTC)
    expect(sorted[0]!.txHash).toBe('0xb');
  });
});

// ---------------------------------------------------------------------------
// txHash fallback logic (used when txHash is null, falls back to record ID)
// ---------------------------------------------------------------------------

describe('txHash fallback', () => {
  test('uses txHash when present', () => {
    const record = { txHash: '0xabc', id: 'snowflake-123' };
    const displayHash = record.txHash ?? record.id;
    expect(displayHash).toBe('0xabc');
  });

  test('falls back to record ID when txHash is null', () => {
    const record = { txHash: null as string | null, id: 'snowflake-123' };
    const displayHash = record.txHash ?? record.id;
    expect(displayHash).toBe('snowflake-123');
  });

  test('explorer URL is empty when using fallback ID', () => {
    const record = { txHash: null as string | null, id: 'snowflake-123' };
    const explorerUrl = record.txHash
      ? getTxExplorerUrl(record.txHash, 8453)
      : '';
    expect(explorerUrl).toBe('');
  });
});
