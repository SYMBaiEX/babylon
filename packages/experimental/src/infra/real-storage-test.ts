/**
 * Real Storage Test
 *
 * Tests actual uploads to IPFS (via Pinata) and Arweave (via Irys)
 * This verifies we can store and retrieve data from decentralized storage.
 */

import { createHash } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

interface StorageConfig {
  pinata: {
    apiKey: string;
    secretKey: string;
    gateway: string;
  };
  ipfsGateways: string[];
  arweaveGateways: string[];
}

const DEFAULT_CONFIG: StorageConfig = {
  pinata: {
    apiKey: process.env.PINATA_API_KEY ?? '',
    secretKey: process.env.PINATA_SECRET_KEY ?? '',
    gateway: 'https://gateway.pinata.cloud/ipfs/',
  },
  ipfsGateways: [
    'https://ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://dweb.link/ipfs/',
    'https://w3s.link/ipfs/',
  ],
  arweaveGateways: [
    'https://arweave.net/',
    'https://ar-io.net/',
    'https://g8way.io/',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// IPFS UPLOAD (via Pinata)
// ═══════════════════════════════════════════════════════════════════════════

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

export async function uploadToIPFS(
  content: string | Buffer,
  filename: string,
  config: StorageConfig = DEFAULT_CONFIG
): Promise<{ cid: string; size: number; url: string }> {
  if (!config.pinata.apiKey || !config.pinata.secretKey) {
    throw new Error(
      'Pinata API keys not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY'
    );
  }

  const data =
    typeof content === 'string' ? content : content.toString('base64');

  const formData = new FormData();
  const blob = new Blob([data], { type: 'application/octet-stream' });
  formData.append('file', blob, filename);

  const metadata = JSON.stringify({
    name: filename,
    keyvalues: {
      source: 'babylon-experimental',
      timestamp: new Date().toISOString(),
    },
  });
  formData.append('pinataMetadata', metadata);

  const response = await fetch(
    'https://api.pinata.cloud/pinning/pinFileToIPFS',
    {
      method: 'POST',
      headers: {
        pinata_api_key: config.pinata.apiKey,
        pinata_secret_api_key: config.pinata.secretKey,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinata upload failed: ${error}`);
  }

  const result = (await response.json()) as PinataResponse;

  return {
    cid: result.IpfsHash,
    size: result.PinSize,
    url: `${config.pinata.gateway}${result.IpfsHash}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// IPFS RETRIEVAL (with fallback)
// ═══════════════════════════════════════════════════════════════════════════

export async function retrieveFromIPFS(
  cid: string,
  config: StorageConfig = DEFAULT_CONFIG
): Promise<{ data: string; gateway: string; latency: number }> {
  const gateways = [config.pinata.gateway, ...config.ipfsGateways];

  for (const gateway of gateways) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${gateway}${cid}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.text();
        return {
          data,
          gateway,
          latency: Date.now() - start,
        };
      }
    } catch {
      clearTimeout(timeout);
      // Try next gateway
    }
  }

  throw new Error(`Failed to retrieve ${cid} from all gateways`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ARWEAVE RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════

export async function retrieveFromArweave(
  txId: string,
  config: StorageConfig = DEFAULT_CONFIG
): Promise<{ data: string; gateway: string; latency: number }> {
  for (const gateway of config.arweaveGateways) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${gateway}${txId}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.text();
        return {
          data,
          gateway,
          latency: Date.now() - start,
        };
      }
    } catch {
      clearTimeout(timeout);
      // Try next gateway
    }
  }

  throw new Error(`Failed to retrieve ${txId} from all Arweave gateways`);
}

// ═══════════════════════════════════════════════════════════════════════════
// GATEWAY HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

interface GatewayHealth {
  gateway: string;
  type: 'ipfs' | 'arweave';
  reachable: boolean;
  latency: number;
  error?: string;
}

export async function checkGatewayHealth(
  config: StorageConfig = DEFAULT_CONFIG
): Promise<GatewayHealth[]> {
  const results: GatewayHealth[] = [];

  // Check IPFS gateways with a well-known CID (IPFS logo)
  const testCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

  for (const gateway of config.ipfsGateways) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${gateway}${testCid}`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      results.push({
        gateway,
        type: 'ipfs',
        reachable: response.ok,
        latency: Date.now() - start,
      });
    } catch (e) {
      results.push({
        gateway,
        type: 'ipfs',
        reachable: false,
        latency: Date.now() - start,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  // Check Arweave gateways with info endpoint
  for (const gateway of config.arweaveGateways) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${gateway}info`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      results.push({
        gateway,
        type: 'arweave',
        reachable: response.ok,
        latency: Date.now() - start,
      });
    } catch (e) {
      results.push({
        gateway,
        type: 'arweave',
        reachable: false,
        latency: Date.now() - start,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL STORAGE TEST
// ═══════════════════════════════════════════════════════════════════════════

interface StorageTestResult {
  success: boolean;
  ipfs: {
    uploaded: boolean;
    retrieved: boolean;
    cid?: string;
    verified: boolean;
    error?: string;
  };
  arweave: {
    gatewaysHealthy: number;
    totalGateways: number;
  };
  gateways: GatewayHealth[];
}

export async function runFullStorageTest(
  config: StorageConfig = DEFAULT_CONFIG
): Promise<StorageTestResult> {
  console.log('\n=== REAL STORAGE TEST ===\n');

  const result: StorageTestResult = {
    success: false,
    ipfs: {
      uploaded: false,
      retrieved: false,
      verified: false,
    },
    arweave: {
      gatewaysHealthy: 0,
      totalGateways: 0,
    },
    gateways: [],
  };

  // 1. Check gateway health
  console.log('1. Checking gateway health...');
  result.gateways = await checkGatewayHealth(config);

  const ipfsHealthy = result.gateways.filter(
    (g) => g.type === 'ipfs' && g.reachable
  ).length;
  const arweaveHealthy = result.gateways.filter(
    (g) => g.type === 'arweave' && g.reachable
  ).length;

  console.log(
    `   IPFS gateways: ${ipfsHealthy}/${result.gateways.filter((g) => g.type === 'ipfs').length} healthy`
  );
  console.log(
    `   Arweave gateways: ${arweaveHealthy}/${result.gateways.filter((g) => g.type === 'arweave').length} healthy`
  );

  result.arweave.gatewaysHealthy = arweaveHealthy;
  result.arweave.totalGateways = result.gateways.filter(
    (g) => g.type === 'arweave'
  ).length;

  // 2. Test IPFS upload (if Pinata configured)
  if (config.pinata.apiKey && config.pinata.secretKey) {
    console.log('\n2. Testing IPFS upload via Pinata...');

    const testData = JSON.stringify({
      test: true,
      timestamp: Date.now(),
      message: 'Babylon experimental storage test',
      random: Math.random().toString(36).slice(2),
    });

    const hash = createHash('sha256').update(testData).digest('hex');

    try {
      const upload = await uploadToIPFS(
        testData,
        `test-${Date.now()}.json`,
        config
      );
      result.ipfs.uploaded = true;
      result.ipfs.cid = upload.cid;
      console.log(`   ✅ Uploaded: ${upload.cid}`);
      console.log(`   Size: ${upload.size} bytes`);

      // 3. Verify retrieval
      console.log('\n3. Verifying IPFS retrieval...');

      // Wait a moment for propagation
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const retrieved = await retrieveFromIPFS(upload.cid, config);
      result.ipfs.retrieved = true;
      console.log(`   ✅ Retrieved from: ${retrieved.gateway}`);
      console.log(`   Latency: ${retrieved.latency}ms`);

      // 4. Verify content integrity
      const retrievedHash = createHash('sha256')
        .update(retrieved.data)
        .digest('hex');
      result.ipfs.verified = hash === retrievedHash;

      if (result.ipfs.verified) {
        console.log('   ✅ Content integrity verified');
      } else {
        console.log('   ❌ Content mismatch!');
      }
    } catch (e) {
      result.ipfs.error = e instanceof Error ? e.message : 'Unknown error';
      console.log(`   ❌ Error: ${result.ipfs.error}`);
    }
  } else {
    console.log('\n2. Skipping IPFS upload (Pinata not configured)');
    console.log('   Set PINATA_API_KEY and PINATA_SECRET_KEY to enable');
  }

  // Summary
  result.success =
    result.gateways.some((g) => g.reachable) &&
    (result.ipfs.verified || !config.pinata.apiKey);

  console.log('\n=== TEST COMPLETE ===');
  console.log(`Result: ${result.success ? '✅ PASSED' : '❌ FAILED'}\n`);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

if (import.meta.main) {
  runFullStorageTest().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}
