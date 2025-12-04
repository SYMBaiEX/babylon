/**
 * Real IPFS Client
 *
 * Connects to actual IPFS network via HTTP API.
 * Works with Pinata, Infura, local node, or any IPFS HTTP API.
 */

export interface IPFSConfig {
  /** IPFS API endpoint (e.g., https://ipfs.infura.io:5001 or http://localhost:5001) */
  apiUrl: string;
  /** Optional gateway URL for reading (e.g., https://ipfs.io/ipfs/) */
  gatewayUrl?: string;
  /** Optional auth header (for Infura/Pinata) */
  authHeader?: string;
}

export interface UploadResult {
  cid: string;
  size: number;
}

/**
 * IPFS client for real network operations
 */
export class IPFSClient {
  private config: IPFSConfig;

  constructor(config: IPFSConfig) {
    this.config = {
      gatewayUrl: 'https://ipfs.io/ipfs/',
      ...config,
    };
  }

  /**
   * Upload data to IPFS
   */
  async upload(data: Uint8Array | string): Promise<UploadResult> {
    const bytes =
      typeof data === 'string' ? new TextEncoder().encode(data) : data;

    const formData = new FormData();
    // Cast to ArrayBuffer for Blob compatibility
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    formData.append('file', new Blob([buffer]));

    const headers: Record<string, string> = {};
    if (this.config.authHeader) {
      headers['Authorization'] = this.config.authHeader;
    }

    const response = await fetch(`${this.config.apiUrl}/api/v0/add`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`IPFS upload failed: ${response.statusText}`);
    }

    const result = (await response.json()) as { Hash: string; Size: string };
    return {
      cid: result.Hash,
      size: Number(result.Size),
    };
  }

  /**
   * Upload JSON to IPFS
   */
  async uploadJSON(data: unknown): Promise<UploadResult> {
    return this.upload(JSON.stringify(data));
  }

  /**
   * Download data from IPFS
   */
  async download(cid: string): Promise<Uint8Array> {
    const url = `${this.config.gatewayUrl}${cid}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`IPFS download failed: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Download and parse JSON from IPFS
   */
  async downloadJSON<T>(cid: string): Promise<T> {
    const bytes = await this.download(cid);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as T;
  }

  /**
   * Pin content (if supported by the node)
   */
  async pin(cid: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.config.authHeader) {
      headers['Authorization'] = this.config.authHeader;
    }

    const response = await fetch(
      `${this.config.apiUrl}/api/v0/pin/add?arg=${cid}`,
      {
        method: 'POST',
        headers,
      }
    );

    if (!response.ok) {
      throw new Error(`IPFS pin failed: ${response.statusText}`);
    }
  }

  /**
   * Check if content exists
   */
  async exists(cid: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.gatewayUrl}${cid}`, {
        method: 'HEAD',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Create IPFS client for common providers
 */
export function createIPFSClient(
  provider: 'local' | 'infura' | 'pinata' | 'custom',
  options?: {
    projectId?: string;
    projectSecret?: string;
    apiUrl?: string;
    gatewayUrl?: string;
  }
): IPFSClient {
  switch (provider) {
    case 'local':
      return new IPFSClient({
        apiUrl: options?.apiUrl ?? 'http://localhost:5001',
        gatewayUrl: options?.gatewayUrl ?? 'http://localhost:8080/ipfs/',
      });

    case 'infura':
      if (!options?.projectId || !options?.projectSecret) {
        throw new Error('Infura requires projectId and projectSecret');
      }
      return new IPFSClient({
        apiUrl: 'https://ipfs.infura.io:5001',
        gatewayUrl: 'https://ipfs.infura.io/ipfs/',
        authHeader: `Basic ${Buffer.from(`${options.projectId}:${options.projectSecret}`).toString('base64')}`,
      });

    case 'pinata':
      if (!options?.projectSecret) {
        throw new Error('Pinata requires API key as projectSecret');
      }
      return new IPFSClient({
        apiUrl: 'https://api.pinata.cloud',
        gatewayUrl: 'https://gateway.pinata.cloud/ipfs/',
        authHeader: `Bearer ${options.projectSecret}`,
      });

    case 'custom':
      if (!options?.apiUrl) {
        throw new Error('Custom provider requires apiUrl');
      }
      return new IPFSClient({
        apiUrl: options.apiUrl,
        gatewayUrl: options.gatewayUrl,
      });

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
