import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PriceUpdateService } from '../price-update-service';
import type { ParsedAbiEntry } from '../../../../tests/types/test-types';

// Mock dependencies
const mockFindUnique = mock();
const mockUpdateOrg = mock();
const mockRecordPriceUpdate = mock();
const mockBroadcast = mock();
const mockUpdatePositions = mock();
const mockGetReadyPerpsEngine = mock().mockResolvedValue({
  updatePositions: mockUpdatePositions,
});

// Mock Viem
const mockReadContract = mock().mockResolvedValue(100n);
const mockWriteContract = mock().mockResolvedValue('0xhash');
const mockWaitForTransactionReceipt = mock().mockResolvedValue({});

mock.module('viem', () => {
  return {
    createPublicClient: () => ({
      readContract: mockReadContract,
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
    }),
    createWalletClient: () => ({
      writeContract: mockWriteContract,
    }),
    http: () => 'http-transport',
    parseAbi: (abi: readonly string[]): ParsedAbiEntry[] => {
        // Return a distinct object so we can verify it was called
        return [{ type: 'parsed', original: [...abi] }];
    },
    encodePacked: () => '0xencoded',
    keccak256: () => '0xhash',
  };
});

mock.module('viem/accounts', () => ({
  privateKeyToAccount: () => ({ address: '0xaccount' }),
}));

mock.module('@/db', () => ({
  db: {
    organization: {
      findUnique: mockFindUnique,
      update: mockUpdateOrg,
    },
  },
}));

mock.module('@/lib/database-service', () => ({
  default: () => ({
    recordPriceUpdate: mockRecordPriceUpdate,
  }),
}));

mock.module('@/lib/sse/event-broadcaster', () => ({
  broadcastToChannel: mockBroadcast,
}));

mock.module('@/lib/perps-service', () => ({
  getReadyPerpsEngine: mockGetReadyPerpsEngine,
}));

mock.module('@/lib/deployment/addresses', () => ({
  getContractAddresses: () => ({ diamond: '0xdiamond', network: 'base-sepolia' }),
  getRpcUrl: () => 'https://rpc.url',
}));

// Mock environment variables
const originalEnv = process.env;

describe('PriceUpdateService On-Chain', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdateOrg.mockReset();
    mockRecordPriceUpdate.mockReset();
    mockBroadcast.mockReset();
    mockUpdatePositions.mockReset();
    mockGetReadyPerpsEngine.mockReset();
    mockReadContract.mockReset();
    mockWriteContract.mockReset();
    mockWaitForTransactionReceipt.mockReset();
    
    mockGetReadyPerpsEngine.mockResolvedValue({
      updatePositions: mockUpdatePositions,
    });

    process.env.DEPLOYER_PRIVATE_KEY = '0x1234567890123456789012345678901234567890123456789012345678901234';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use parsed ABI for on-chain updates', async () => {
    mockFindUnique.mockResolvedValue({ id: 'org-1', currentPrice: 100 });
    mockReadContract.mockResolvedValue(100n); // tick counter

    await PriceUpdateService.applyUpdates([
      {
        organizationId: 'org-1',
        newPrice: 105,
        source: 'system',
      },
    ]);

    // Verify writeContract was called
    expect(mockWriteContract).toHaveBeenCalled();

    // Verify the ABI passed to writeContract was the "parsed" one (from our mock)
    const calls = mockWriteContract.mock.calls;
    const args = calls[0];
    const abi = args[0].abi;

    // Our mock parseAbi returns [{ type: 'parsed', original: abi }]
    expect(abi).toBeArray();
    expect(abi[0]).toEqual(expect.objectContaining({ type: 'parsed' }));
    
    // Verify readContract was also called with parsed ABI
    expect(mockReadContract).toHaveBeenCalled();
    const readArgs = mockReadContract.mock.calls[0][0];
    expect(readArgs.abi).toBeArray();
    expect(readArgs.abi[0]).toEqual(expect.objectContaining({ type: 'parsed' }));
  });
});

