/**
 * A2A Server Type Definitions
 * 
 * Types for A2A server configuration and dependencies
 */

import type { JsonValue } from './common';
import type { PaymentVerificationParams, PaymentVerificationResult } from './payments';

/**
 * Agent registry entry
 */
export interface AgentRegistryEntry {
  agentId: string;
  [key: string]: JsonValue;
}

/**
 * Registry client interface
 */
export interface RegistryClient {
  register(agentId: string, data: Record<string, JsonValue>): Promise<void>;
  unregister(agentId: string): Promise<void>;
  getAgents(): Promise<AgentRegistryEntry[]>;
  getAgent(agentId: string): Promise<AgentRegistryEntry | null>;
}

/**
 * Payment request result (matches PaymentRequest from a2a/types)
 */
export interface PaymentRequestResult {
  requestId: string;
  from: string;
  to: string;
  amount: string;
  service: string;
  metadata?: Record<string, JsonValue>;
  expiresAt: number;
}

/**
 * X402 payment manager interface
 * Matches the actual X402Manager implementation
 */
export interface X402Manager {
  createPaymentRequest(
    from: string,
    to: string,
    amount: string,
    service: string,
    metadata?: Record<string, string | number | boolean | null>
  ): PaymentRequestResult;
  verifyPayment(verificationData: PaymentVerificationParams): Promise<PaymentVerificationResult>;
  getPaymentRequest(requestId: string): PaymentRequestResult | null;
  isPaymentVerified(requestId: string): boolean;
  cancelPaymentRequest(requestId: string): boolean;
  getPendingPayments(agentAddress: string): PaymentRequestResult[];
  getStatistics(): {
    totalPending: number;
    totalVerified: number;
    totalExpired: number;
  };
}

