/**
 * Agent Wallet Manager
 * 
 * Deterministic HD wallet derivation for agents using BIP-32/44
 * Each agent gets a unique wallet derived from a master mnemonic
 */

import { Wallet, HDNodeWallet, Mnemonic } from 'ethers'

const DERIVATION_PATH_BASE = "m/44'/60'/0'/0"

/**
 * Generate agent wallet from master mnemonic and derivation index
 */
export function generateAgentWallet(agentId: string, masterMnemonic: string, derivationIndex: number): HDNodeWallet {
  const mnemonic = Mnemonic.fromPhrase(masterMnemonic)
  const path = `${DERIVATION_PATH_BASE}/${derivationIndex}`
  const hdNode = HDNodeWallet.fromMnemonic(mnemonic, path)
  return hdNode
}

/**
 * Get private key for agent wallet
 */
export function getAgentPrivateKey(wallet: HDNodeWallet): string {
  return wallet.privateKey
}

/**
 * Get address for agent wallet
 */
export function getAgentAddress(wallet: HDNodeWallet): string {
  return wallet.address
}

/**
 * Sign message with agent wallet
 */
export async function signMessage(wallet: HDNodeWallet, message: string): Promise<string> {
  return await wallet.signMessage(message)
}

/**
 * Derive multiple agent wallets at once
 */
export function generateAgentWallets(agentIds: string[], masterMnemonic: string): Map<string, HDNodeWallet> {
  const wallets = new Map<string, HDNodeWallet>()
  
  agentIds.forEach((agentId, index) => {
    const wallet = generateAgentWallet(agentId, masterMnemonic, index)
    wallets.set(agentId, wallet)
  })
  
  return wallets
}


