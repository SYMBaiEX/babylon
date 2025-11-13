import { z } from 'zod';
import { JsonValueSchema } from '@/types/common';

export const DiscoverParamsSchema = z.object({
  filters: z.object({
    strategies: z.array(z.string()).optional(),
    minReputation: z.number().optional(),
    markets: z.array(z.string()).optional(),
  }).optional(),
  limit: z.number().optional(),
});

export const GetAgentInfoParamsSchema = z.object({
  agentId: z.string(),
});

export const GetMarketDataParamsSchema = z.object({
  marketId: z.string(),
});

export const GetMarketPricesParamsSchema = z.object({
    marketId: z.string(),
});

export const SubscribeMarketParamsSchema = z.object({
  marketId: z.string(),
});

export const ProposeCoalitionParamsSchema = z.object({
  name: z.string(),
  targetMarket: z.string(),
  strategy: z.string(),
  minMembers: z.number(),
  maxMembers: z.number(),
});

export const JoinCoalitionParamsSchema = z.object({
  coalitionId: z.string(),
});

export const CoalitionMessageParamsSchema = z.object({
  coalitionId: z.string(),
  messageType: z.enum(['analysis', 'vote', 'action', 'coordination']),
  content: z.record(z.string(), JsonValueSchema),
});

export const LeaveCoalitionParamsSchema = z.object({
  coalitionId: z.string(),
});

export const RequestAnalysisParamsSchema = z.object({
  marketId: z.string(),
  paymentOffer: z.string().optional(),
  deadline: z.number(),
});

export const PaymentRequestParamsSchema = z.object({
  to: z.string(),
  amount: z.string(),
  service: z.string(),
  metadata: z.record(z.string(), JsonValueSchema).optional(),
  from: z.string().optional(),
});

export const PaymentReceiptParamsSchema = z.object({
  requestId: z.string(),
  txHash: z.string(),
});

export const GetAnalysesParamsSchema = z.object({
    marketId: z.string(),
    limit: z.number().optional(),
});

