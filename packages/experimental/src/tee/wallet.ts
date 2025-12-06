/**
 * TEE Wallet
 *
 * Derives an Ethereum wallet from TEE keystore.
 * Private key exists only inside the enclave simulation.
 */

import { type Address, type Hex, keccak256, toBytes, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { TEEKeystore } from './keystore.js';

export interface SignedMessage {
  message: string;
  signature: Hex;
  address: Address;
}

export interface SignedTransaction {
  to: Address;
  data: Hex;
  value: bigint;
  nonce: number;
  signature: Hex;
  from: Address;
}

const WALLET_KEY_LABEL = 'ethereum_wallet';

/**
 * TEE-derived Ethereum wallet
 * Private key exists only inside the enclave
 */
export class TEEWallet {
  private privateKey: Hex;
  public readonly address: Address;
  private nonce = 0;

  private constructor(privateKey: Hex, address: Address) {
    this.privateKey = privateKey;
    this.address = address;
  }

  /**
   * Create a wallet from a TEE keystore
   */
  static async create(keystore: TEEKeystore): Promise<TEEWallet> {
    // Derive wallet key from keystore
    const walletKeyBytes = await keystore.getRawKeyBytes(WALLET_KEY_LABEL);
    const privateKey = toHex(walletKeyBytes);

    // Get address from private key
    const account = privateKeyToAccount(privateKey);
    const address = account.address;

    return new TEEWallet(privateKey, address);
  }

  /**
   * Sign a message (proves the enclave owns this address)
   */
  signMessage(message: string): SignedMessage {
    const messageHash = keccak256(toBytes(message));

    // Simplified signature (real impl uses secp256k1)
    const sigMaterial = new Uint8Array([
      ...toBytes(this.privateKey),
      ...toBytes(messageHash),
    ]);
    const signature = keccak256(sigMaterial);

    return {
      message,
      signature,
      address: this.address,
    };
  }

  /**
   * Sign a transaction to be submitted on-chain
   */
  signTransaction(to: Address, data: Hex, value = 0n): SignedTransaction {
    const txHash = keccak256(toBytes(`${to}:${data}:${value}:${this.nonce}`));

    // Simplified signature
    const sigMaterial = new Uint8Array([
      ...toBytes(this.privateKey),
      ...toBytes(txHash),
    ]);
    const signature = keccak256(sigMaterial);

    const tx: SignedTransaction = {
      to,
      data,
      value,
      nonce: this.nonce,
      signature,
      from: this.address,
    };

    this.nonce++;
    return tx;
  }

  /**
   * Get the public address (safe to share)
   */
  getAddress(): Address {
    return this.address;
  }

  /**
   * Get current nonce
   */
  getNonce(): number {
    return this.nonce;
  }
}
