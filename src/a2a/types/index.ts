/**
 * A2A Protocol Type Definitions
 * Agent-to-Agent communication types following JSON-RPC 2.0 spec
 */

// JSON-RPC 2.0 Base Types
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown> | unknown[]
  id: string | number
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  result?: unknown
  error?: JsonRpcError
  id: string | number | null
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown> | unknown[]
}

// A2A Protocol Methods
export enum A2AMethod {
  // Handshake & Authentication
  HANDSHAKE = 'a2a.handshake',
  AUTHENTICATE = 'a2a.authenticate',

  // Agent Discovery
  DISCOVER_AGENTS = 'a2a.discover',
  GET_AGENT_INFO = 'a2a.getInfo',

  // Market Operations
  GET_MARKET_DATA = 'a2a.getMarketData',
  GET_MARKET_PRICES = 'a2a.getMarketPrices',
  SUBSCRIBE_MARKET = 'a2a.subscribeMarket',

  // Coalition & Coordination
  PROPOSE_COALITION = 'a2a.proposeCoalition',
  JOIN_COALITION = 'a2a.joinCoalition',
  COALITION_MESSAGE = 'a2a.coalitionMessage',
  LEAVE_COALITION = 'a2a.leaveCoalition',

  // Information Sharing
  SHARE_ANALYSIS = 'a2a.shareAnalysis',
  REQUEST_ANALYSIS = 'a2a.requestAnalysis',

  // x402 Micropayments
  PAYMENT_REQUEST = 'a2a.paymentRequest',
  PAYMENT_RECEIPT = 'a2a.paymentReceipt'
}

// Agent Connection Types
export interface AgentCredentials {
  address: string // Ethereum address
  tokenId: number // ERC-8004 token ID
  signature: string // Signed message proving ownership
  timestamp: number
}

export interface AgentCapabilities {
  strategies: string[]
  markets: string[]
  actions: string[]
  version: string
}

export interface AgentProfile {
  tokenId: number
  address: string
  name: string
  endpoint: string
  capabilities: AgentCapabilities
  reputation: AgentReputation
  isActive: boolean
}

export interface AgentReputation {
  totalBets: number
  winningBets: number
  accuracyScore: number
  trustScore: number
  totalVolume: string
}

export interface AgentConnection {
  agentId: string
  address: string
  tokenId: number
  capabilities: AgentCapabilities
  authenticated: boolean
  connectedAt: number
  lastActivity: number
}

// Market Data Types
export interface MarketData {
  marketId: string
  question: string
  outcomes: string[]
  prices: number[]
  volume: string
  liquidity: string
  resolveAt: number
  resolved: boolean
  winningOutcome?: number
}

export interface MarketSubscription {
  marketId: string
  agentId: string
  subscribedAt: number
}

// Coalition Types
export interface Coalition {
  id: string
  name: string
  members: string[] // Agent IDs
  strategy: string
  targetMarket: string
  createdAt: number
  active: boolean
}

export interface CoalitionProposal {
  coalitionId: string
  proposer: string
  targetMarket: string
  strategy: string
  minMembers: number
  maxMembers: number
  expiresAt: number
}

export interface CoalitionMessage {
  coalitionId: string
  from: string
  messageType: 'analysis' | 'vote' | 'action' | 'coordination'
  content: unknown
  timestamp: number
}

// Analysis Sharing Types
export interface MarketAnalysis {
  marketId: string
  analyst: string
  prediction: number // 0-1 probability
  confidence: number // 0-1 confidence level
  reasoning: string
  dataPoints: Record<string, unknown>
  timestamp: number
  signature?: string
}

export interface AnalysisRequest {
  marketId: string
  requester: string
  paymentOffer?: string // x402 payment amount
  deadline: number
}

// x402 Micropayment Types
export interface PaymentRequest {
  requestId: string
  from: string
  to: string
  amount: string // in wei
  service: string
  metadata?: Record<string, unknown>
  expiresAt: number
}

export interface PaymentReceipt {
  requestId: string
  txHash: string
  from: string
  to: string
  amount: string
  timestamp: number
  confirmed: boolean
}

// WebSocket Message Types
export interface HandshakeRequest {
  credentials: AgentCredentials
  capabilities: AgentCapabilities
  endpoint: string
}

export interface HandshakeResponse {
  agentId: string
  sessionToken: string
  serverCapabilities: string[]
  expiresAt: number
}

export interface DiscoverRequest {
  filters?: {
    strategies?: string[]
    minReputation?: number
    markets?: string[]
  }
  limit?: number
}

export interface DiscoverResponse {
  agents: AgentProfile[]
  total: number
}

// Error Codes (following JSON-RPC 2.0 spec + custom)
export enum ErrorCode {
  // JSON-RPC 2.0 Standard
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,

  // A2A Protocol Custom
  NOT_AUTHENTICATED = -32000,
  AUTHENTICATION_FAILED = -32001,
  AGENT_NOT_FOUND = -32002,
  MARKET_NOT_FOUND = -32003,
  COALITION_NOT_FOUND = -32004,
  PAYMENT_FAILED = -32005,
  RATE_LIMIT_EXCEEDED = -32006,
  INVALID_SIGNATURE = -32007,
  EXPIRED_REQUEST = -32008
}

// Server Configuration
export interface A2AServerConfig {
  port: number
  host?: string
  maxConnections?: number
  messageRateLimit?: number
  authTimeout?: number
  enableX402?: boolean
  enableCoalitions?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
}

// Client Configuration
export interface A2AClientConfig {
  endpoint: string
  credentials: {
    address: string
    privateKey: string
    tokenId?: number
  }
  capabilities: AgentCapabilities
  autoReconnect?: boolean
  reconnectInterval?: number
  heartbeatInterval?: number
}

// Event Types
export interface A2AEvent {
  type: string
  data: unknown
  timestamp: number
}

export enum A2AEventType {
  AGENT_CONNECTED = 'agent.connected',
  AGENT_DISCONNECTED = 'agent.disconnected',
  MARKET_UPDATE = 'market.update',
  COALITION_INVITE = 'coalition.invite',
  COALITION_MESSAGE = 'coalition.message',
  PAYMENT_RECEIVED = 'payment.received',
  ANALYSIS_RECEIVED = 'analysis.received'
}
