/**
 * Domain-specific error classes for Babylon business logic
 *
 * These errors extend Error directly and can be used with any error handling system.
 * For BabylonError-based error handling, use errors from @babylon/agents or @babylon/api.
 */

/**
 * Business logic error base class
 */
export abstract class BusinessLogicError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode = 400,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Insufficient funds error for balance-related issues
 */
export class InsufficientFundsError extends BusinessLogicError {
  constructor(
    public readonly required: number,
    public readonly available: number,
    public readonly currency: string = 'USD'
  ) {
    super(
      `Insufficient funds: required ${required} ${currency}, available ${available} ${currency}`,
      'INSUFFICIENT_FUNDS',
      400,
      { required, available, currency }
    );
  }
}

/**
 * Trading error for market operations
 */
export class TradingError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly marketId: string,
    public readonly reason:
      | 'MARKET_CLOSED'
      | 'INVALID_PRICE'
      | 'POSITION_LIMIT'
      | 'RISK_LIMIT'
      | 'SLIPPAGE_EXCEEDED'
      | 'ORDER_EXPIRED'
  ) {
    super(message, `TRADING_${reason}`, 400, { marketId, reason });
  }
}

/**
 * Position error for position management issues
 */
export class PositionError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly positionId: string,
    public readonly poolId: string,
    public readonly reason:
      | 'NOT_FOUND'
      | 'ALREADY_CLOSED'
      | 'INSUFFICIENT_MARGIN'
      | 'MAX_LEVERAGE'
  ) {
    super(message, `POSITION_${reason}`, 400, { positionId, poolId, reason });
  }
}

/**
 * Agent error for A2A operations
 */
export class AgentError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly agentId: string,
    public readonly operation: string,
    public readonly reason?: string
  ) {
    super(message, 'AGENT_ERROR', 400, { agentId, operation, reason });
  }
}

/**
 * Agent authentication error
 */
export class AgentAuthenticationError extends BusinessLogicError {
  constructor(
    public readonly agentId: string,
    public readonly reason:
      | 'NOT_REGISTERED'
      | 'INVALID_SIGNATURE'
      | 'EXPIRED_NONCE'
      | 'BANNED'
  ) {
    super(
      `Agent authentication failed: ${reason}`,
      `AGENT_AUTH_${reason}`,
      401,
      { agentId, reason }
    );
  }
}

/**
 * Coalition error for coalition operations
 */
export class CoalitionError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly coalitionId: string,
    public readonly reason:
      | 'NOT_FOUND'
      | 'NOT_MEMBER'
      | 'ALREADY_MEMBER'
      | 'FULL'
      | 'DISBANDED'
  ) {
    super(message, `COALITION_${reason}`, 400, { coalitionId, reason });
  }
}

/**
 * Blockchain error for web3 interactions
 */
export class BlockchainError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly txHash?: string,
    public readonly blockNumber?: number,
    public readonly gasUsed?: string
  ) {
    super(`Blockchain: ${message}`, 'BLOCKCHAIN_ERROR', 502, {
      service: 'Blockchain',
      txHash,
      blockNumber,
      gasUsed,
    });
  }
}

/**
 * Smart contract error for contract interactions
 */
export class SmartContractError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly contractAddress: string,
    public readonly method: string,
    public readonly revertReason?: string,
    public readonly txHash?: string,
    public readonly blockNumber?: number,
    public readonly gasUsed?: string
  ) {
    super(`Smart Contract: ${message}`, 'SMART_CONTRACT_ERROR', 502, {
      service: 'Blockchain',
      contractAddress,
      method,
      revertReason,
      txHash,
      blockNumber,
      gasUsed,
    });
  }
}

/**
 * Wallet error for wallet operations
 */
export class WalletError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly walletAddress: string,
    public readonly reason:
      | 'INVALID_ADDRESS'
      | 'NOT_CONNECTED'
      | 'WRONG_NETWORK'
      | 'INSUFFICIENT_GAS'
      | 'USER_REJECTED'
  ) {
    super(message, `WALLET_${reason}`, 400, { walletAddress, reason });
  }
}

/**
 * Deposit error for deposit operations
 */
export class DepositError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly depositId: string,
    public readonly reason:
      | 'MIN_AMOUNT'
      | 'MAX_AMOUNT'
      | 'ALREADY_WITHDRAWN'
      | 'LOCKED'
      | 'EXPIRED'
  ) {
    super(message, `DEPOSIT_${reason}`, 400, { depositId, reason });
  }
}

/**
 * Withdrawal error for withdrawal operations
 */
export class WithdrawalError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly withdrawalId: string,
    public readonly reason:
      | 'INSUFFICIENT_BALANCE'
      | 'PENDING_TRADES'
      | 'COOLDOWN'
      | 'ALREADY_PROCESSED'
      | 'INVALID_AMOUNT'
  ) {
    super(message, `WITHDRAWAL_${reason}`, 400, { withdrawalId, reason });
  }
}

/**
 * Game error for game-related operations
 */
export class GameError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly gameId: string,
    public readonly reason:
      | 'NOT_STARTED'
      | 'ALREADY_ENDED'
      | 'INVALID_STATE'
      | 'MAX_PLAYERS'
      | 'NOT_PLAYER'
  ) {
    super(message, `GAME_${reason}`, 400, { gameId, reason });
  }
}

/**
 * Feed error for social feed operations
 */
export class FeedError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly feedId: string,
    public readonly reason:
      | 'GENERATION_FAILED'
      | 'RATE_LIMITED'
      | 'INVALID_CONTENT'
      | 'MODERATION_FAILED'
  ) {
    super(message, `FEED_${reason}`, 400, { feedId, reason });
  }
}

/**
 * LLM error for AI/LLM operations
 */
export class LLMError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly model: string,
    public readonly tokensUsed?: number,
    public readonly reason?:
      | 'RATE_LIMIT'
      | 'CONTEXT_LENGTH'
      | 'INVALID_RESPONSE'
      | 'TIMEOUT'
  ) {
    super(`LLM: ${message}`, 'LLM_ERROR', 503, {
      service: 'LLM',
      model,
      tokensUsed,
      reason,
    });
  }
}

/**
 * Payment error for payment processing
 */
export class PaymentError extends BusinessLogicError {
  constructor(
    message: string,
    public readonly paymentId: string,
    public readonly reason:
      | 'DECLINED'
      | 'EXPIRED'
      | 'INVALID_CARD'
      | 'INSUFFICIENT_FUNDS'
      | 'FRAUD_DETECTED'
  ) {
    super(message, `PAYMENT_${reason}`, 400, { paymentId, reason });
  }
}

