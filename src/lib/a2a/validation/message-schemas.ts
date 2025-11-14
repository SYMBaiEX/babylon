/**
 * A2A Message Validation Schemas
 * 
 * Comprehensive Zod schemas for all A2A protocol messages.
 * Ensures type safety and prevents invalid messages from crashing the server.
 */

import { z } from 'zod'
import { AgentCapabilitiesSchema } from '@/types/a2a'

/**
 * Handshake message schema
 */
export const HandshakeSchema = z.object({
  agentId: z.string().min(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenId: z.number().int().nonnegative().optional(),
  signature: z.string().min(1),
  timestamp: z.number(),
  capabilities: AgentCapabilitiesSchema.optional()
})

/**
 * Discover agents schema
 */
export const DiscoverSchema = z.object({
  filters: z.object({
    strategies: z.array(z.string()).optional(),
    minReputation: z.number().optional(),
    markets: z.array(z.string()).optional()
  }).optional(),
  limit: z.number().int().positive().max(100).optional()
})

/**
 * Get agent info schema
 */
export const GetAgentInfoSchema = z.object({
  agentId: z.string().min(1)
})

/**
 * Get market data schema
 */
export const GetMarketDataSchema = z.object({
  marketId: z.string().min(1)
})

/**
 * Get market prices schema
 */
export const GetMarketPricesSchema = z.object({
  marketId: z.string().min(1)
})

/**
 * Subscribe to market schema
 */
export const SubscribeMarketSchema = z.object({
  marketId: z.string().min(1)
})

/**
 * Buy shares schema
 */
export const BuySharesSchema = z.object({
  marketId: z.string().min(1),
  outcome: z.number().int().nonnegative(),
  amount: z.string().regex(/^\d+$/)
})

/**
 * Sell shares schema
 */
export const SellSharesSchema = z.object({
  marketId: z.string().min(1),
  outcome: z.number().int().nonnegative(),
  amount: z.string().regex(/^\d+$/)
})

/**
 * Propose coalition schema
 */
export const ProposeCoalitionSchema = z.object({
  name: z.string().min(1),
  strategy: z.string().min(1),
  targetMarket: z.string().min(1),
  members: z.array(z.string()).min(1)
})

/**
 * Join coalition schema
 */
export const JoinCoalitionSchema = z.object({
  coalitionId: z.string().min(1)
})

/**
 * Coalition message schema
 */
export const CoalitionMessageSchema = z.object({
  coalitionId: z.string().min(1),
  message: z.string().min(1)
})

/**
 * Leave coalition schema
 */
export const LeaveCoalitionSchema = z.object({
  coalitionId: z.string().min(1)
})

/**
 * Share analysis schema
 */
export const ShareAnalysisSchema = z.object({
  marketId: z.string().min(1),
  analysis: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  recommendation: z.enum(['BUY', 'SELL', 'HOLD']).optional()
})

/**
 * Request analysis schema
 */
export const RequestAnalysisSchema = z.object({
  marketId: z.string().min(1),
  targetAgentId: z.string().optional()
})

/**
 * Get analyses schema
 */
export const GetAnalysesSchema = z.object({
  marketId: z.string().min(1),
  limit: z.number().int().positive().max(100).optional()
})

/**
 * Payment request schema (x402)
 */
export const PaymentRequestSchema = z.object({
  amount: z.string().regex(/^\d+$/),
  currency: z.string(),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  description: z.string().optional()
})

/**
 * Payment receipt schema (x402)
 */
export const PaymentReceiptSchema = z.object({
  paymentId: z.string(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  amount: z.string().regex(/^\d+$/),
  timestamp: z.number()
})

/**
 * Map of all A2A message schemas by method
 */
export const A2AMessageSchemas: Record<string, z.ZodSchema> = {
  'a2a.handshake': HandshakeSchema,
  'a2a.discover': DiscoverSchema,
  'a2a.getInfo': GetAgentInfoSchema,
  'a2a.getMarketData': GetMarketDataSchema,
  'a2a.getMarketPrices': GetMarketPricesSchema,
  'a2a.subscribeMarket': SubscribeMarketSchema,
  'a2a.buyShares': BuySharesSchema,
  'a2a.sellShares': SellSharesSchema,
  'a2a.proposeCoalition': ProposeCoalitionSchema,
  'a2a.joinCoalition': JoinCoalitionSchema,
  'a2a.coalitionMessage': CoalitionMessageSchema,
  'a2a.leaveCoalition': LeaveCoalitionSchema,
  'a2a.shareAnalysis': ShareAnalysisSchema,
  'a2a.requestAnalysis': RequestAnalysisSchema,
  'a2a.getAnalyses': GetAnalysesSchema,
  'a2a.paymentRequest': PaymentRequestSchema,
  'a2a.paymentReceipt': PaymentReceiptSchema
}

/**
 * Validate A2A message parameters
 */
export function validateA2AMessage(method: string, params: unknown): { 
  success: boolean
  data?: unknown
  error?: z.ZodError 
} {
  const schema = A2AMessageSchemas[method]
  
  if (!schema) {
    // No schema defined, allow through
    return { success: true, data: params }
  }
  
  const result = schema.safeParse(params)
  
  if (!result.success) {
    return { success: false, error: result.error }
  }
  
  return { success: true, data: result.data }
}

