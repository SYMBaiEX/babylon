/**
 * Autonomous Trading Service
 *
 * Handles agents making REAL trades on prediction markets and perps
 */

import { countTokensSync, truncateToTokenLimitSync } from '@babylon/api';
import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import {
  actorState,
  and,
  asSystem,
  asUser,
  db,
  desc,
  eq,
  getDbInstance,
  gte,
  isNull,
  markets,
  perpPositions,
  positions,
  sql,
  users,
} from '@babylon/db';
import {
  formatRandomContext,
  generateRandomMarketContext,
  PredictionPricing,
  StaticDataRegistry,
  shuffleArray,
  WalletService,
} from '@babylon/engine';
import type { IAgentRuntime } from '@elizaos/core';
import { callGroqDirect } from '../llm/direct-groq';
import { agentPnLService } from '../services/AgentPnLService';
import { getAgentConfig } from '../shared/agent-config';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';

export class AutonomousTradingService {
  /**
   * Evaluate and execute trades for an agent
   *
   * Analyzes market conditions and agent strategy to make trading decisions.
   * Executes trades on prediction markets and perpetual markets based on LLM analysis.
   *
   * @param agentUserId - Unique identifier for the agent
   * @param _runtime - Agent runtime (reserved for future use)
   * @returns Trade execution result with count and market identifiers
   * @throws Error if agent not found
   *
   * @remarks
   * - Uses LLM to analyze market conditions and make trading decisions
   * - Shuffles markets to add variety to prompts
   * - Continues processing even if individual trades fail
   * - Returns market identifiers for trajectory recording
   *
   * @example
   * ```typescript
   * const result = await tradingService.executeTrades('agent-123', runtime);
   * console.log(`Executed ${result.tradesExecuted} trades`);
   * ```
   */
  async executeTrades(
    agentUserId: string,
    _runtime: IAgentRuntime
  ): Promise<{
    tradesExecuted: number;
    marketId?: string;
    ticker?: string;
    side?: string;
    marketType?: 'prediction' | 'perp';
  }> {
    // Check if this is an NPC (has entry in StaticDataRegistry)
    const npcActor = StaticDataRegistry.getActor(agentUserId);
    const isNpc = !!npcActor;

    // Get agent from User table (will be null for NPCs)
    const agentResult = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);
    const agent = agentResult[0];

    // Fallback values for NPCs (who don't have User records)
    const agentDisplayName = isNpc
      ? npcActor.name
      : (agent?.displayName ?? agentUserId);
    const agentLifetimePnL = agent?.lifetimePnL ?? 0;
    const agentManagedBy = agent?.managedBy ?? agentUserId;

    // Get agent config (may be null for NPCs)
    const config = await getAgentConfig(agentUserId);

    // Get agent's positions separately
    const positionsResult = await db
      .select()
      .from(positions)
      .where(
        and(eq(positions.userId, agentUserId), eq(positions.status, 'active'))
      );

    const perpPositionsResult = await db
      .select()
      .from(perpPositions)
      .where(
        and(
          eq(perpPositions.userId, agentUserId),
          isNull(perpPositions.closedAt)
        )
      );

    // Get current markets
    const predictionMarkets = await db
      .select()
      .from(markets)
      .where(and(eq(markets.resolved, false), gte(markets.endDate, new Date())))
      .orderBy(desc(markets.createdAt))
      .limit(10);

    // Get perp markets from static registry with dynamic prices
    const orgStates = await getDbInstance().getOrganizationsByPrice();
    const perpMarkets = orgStates
      .slice(0, 10)
      .map((state) => {
        const staticOrg = StaticDataRegistry.getOrganization(state.id);
        return staticOrg
          ? {
              ...staticOrg,
              currentPrice: state.currentPrice ?? staticOrg.initialPrice,
            }
          : null;
      })
      .filter(
        (o): o is NonNullable<typeof o> => o !== null && o.type === 'company'
      );

    // Get balance - NPCs use ActorState, Users use WalletService
    let balance: { balance: number; lifetimePnL: number };
    if (isNpc) {
      const [actor] = await db
        .select({ tradingBalance: actorState.tradingBalance })
        .from(actorState)
        .where(eq(actorState.id, agentUserId))
        .limit(1);
      balance = {
        balance: Number(actor?.tradingBalance ?? 10000),
        lifetimePnL: 0, // NPCs don't track lifetimePnL
      };
    } else {
      const walletBalance = await WalletService.getBalance(agentUserId);
      balance = {
        balance: walletBalance.balance,
        lifetimePnL: walletBalance.lifetimePnL,
      };
    }

    // Shuffle markets to add variety to prompts
    const shuffledPredictions = shuffleArray(predictionMarkets);
    const shuffledPerps = shuffleArray(perpMarkets);

    // Get random market context for variety
    const marketContext = await generateRandomMarketContext({
      includeGainers: true,
      includeLosers: true,
      includeQuestions: true,
      includePosts: false,
      includeEvents: true,
    });
    const contextString = formatRandomContext(marketContext);

    // Build trading decision prompt
    // NPC trust scores are provided by experiencePlugin (marketOutcomeEvaluator)
    // and appear in agent context automatically via providers
    const prompt = `${config?.systemPrompt ?? 'You are an autonomous trading agent on Babylon.'}

You are ${agentDisplayName}, an autonomous trading agent.

Trading Strategy: ${config?.tradingStrategy ?? 'General market analysis'}

Current Status:
- Balance: $${balance.balance}
- P&L: ${agentLifetimePnL}
- Open Positions: ${positionsResult.length + perpPositionsResult.length}

Available Prediction Markets:
${shuffledPredictions
  .slice(0, 5)
  .map((m) => `- ${m.question} (YES: ${m.yesShares}, NO: ${m.noShares})`)
  .join('\n')}

Available Perp Markets:
${shuffledPerps
  .slice(0, 5)
  .map((o) => {
    const initial = o.initialPrice ?? 100;
    const current = o.currentPrice ?? initial;
    const changePercent = (((current - initial) / initial) * 100).toFixed(1);
    const direction = current > initial ? '📈' : current < initial ? '📉' : '➡️';
    return `- ${o.ticker}: ${o.name} @ $${current.toFixed(2)} ${direction} ${changePercent}% from IPO ($${initial})`;
  })
  .join('\n')}

Your Open Positions:
${positionsResult.map((p) => `- Prediction: ${p.marketId}, ${p.side ? 'YES' : 'NO'}, ${p.shares} shares`).join('\n') || 'None'}
${perpPositionsResult.map((p) => `- Perp: ${p.ticker}, ${p.side}, $${p.size}, ${p.leverage}x`).join('\n') || 'None'}

Analyze the markets and decide if you should trade based on YOUR strategy and personality.

Trading Guidelines:
- Consider using 10-20% of balance per trade (e.g. $100-$200 with $1000 balance)
- Prediction markets: buy_yes, buy_no, or sell existing positions
- Perp markets: open_long, open_short, or close existing positions
- Consider YES/NO odds and look for value
- You decide the trade size based on your conviction and strategy

IMPORTANT: After your analysis, you MUST output valid JSON at the end.

Your response format:
1. Think through the decision (optional analysis/reasoning)
2. End with ONLY this JSON (no text after):

FOR PREDICTION TRADE:
{"action": "trade", "trade": {"type": "prediction", "market": "exact question text", "action": "buy_yes" | "buy_no" | "sell", "amount": 150, "reasoning": "Market [name], YES:NO ratio [X:Y], betting [side] because [specific reason with probability/edge/catalyst]"}}

FOR PERP TRADE:
{"action": "trade", "trade": {"type": "perp", "market": "ticker", "action": "open_long" | "open_short" | "close", "amount": 200, "reasoning": "Ticker [name], current price $[X], going [direction] because [specific technical/fundamental reason]"}}

FOR HOLD:
{"action": "hold", "reasoning": "Why not trading: [specific reason - no conviction/waiting for better setup/insufficient data/etc]"}

${contextString}`;

    // Ensure prompt fits within 32K context limit (W&B trained models)
    const estimatedTokens = countTokensSync(prompt);
    let finalPrompt = prompt;

    if (estimatedTokens > 30000) {
      // 30K with 2K safety margin
      logger.warn(
        `Trading prompt too long: ${estimatedTokens} tokens, truncating`,
        { agentUserId }
      );
      const truncated = truncateToTokenLimitSync(prompt, 30000, {
        ellipsis: true,
      });
      finalPrompt = truncated.text;
      logger.info(`Truncated to ${truncated.tokens} tokens`, { agentUserId });
    }

    // Use large model (qwen3-32b or trained W&B model) for trading decisions
    // Add timeout to prevent hanging (30 seconds max)
    // Trajectory logging is auto-extracted from runtime in callGroqDirect
    const decision = await Promise.race([
      callGroqDirect({
        prompt: finalPrompt,
        system:
          config?.systemPrompt ??
          'You are a trading agent. Think through your decision, then end your response with valid JSON.',
        modelSize: 'small', // Uses llama-3.3-70b-versatile - good at JSON format
        runtime: _runtime, // Pass runtime to access W&B trained models AND trajectory context
        temperature: 0.7, // Normal temperature for natural decision-making
        maxTokens: 1000, // Increased to allow reasoning + complete JSON output
        actionType: 'evaluate_trading_opportunity',
        purpose: 'action', // Track this as an ACTION call for RL
      }),
      new Promise<string>((resolve) => {
        setTimeout(() => {
          logger.warn(
            `Trading decision timeout for agent ${agentUserId}, defaulting to hold`,
            undefined,
            'AutonomousTrading'
          );
          resolve('{"action": "hold"}');
        }, 30000); // 30 second timeout
      }),
    ]);

    // Strip out <think> tags if present (some models like to reason first)
    let cleanedDecision = decision;
    if (decision.includes('<think>')) {
      cleanedDecision = decision
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim();
    }

    // Extract JSON from response - find the LAST JSON object (in case reasoning comes before)
    // Match all JSON objects and take the last one
    const allJsonMatches = cleanedDecision.match(
      /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
    );
    const jsonMatch = allJsonMatches
      ? allJsonMatches[allJsonMatches.length - 1]
      : null;

    if (!jsonMatch) {
      logger.error(
        '❌ Failed to extract JSON from LLM response',
        {
          agentUserId,
          responsePreview: decision.substring(0, 300),
          hasThinkTags: decision.includes('<think>'),
        },
        'AutonomousTrading'
      );
      throw new Error(
        `Failed to parse trade decision JSON from LLM response: ${decision.substring(0, 200)}`
      );
    }

    let tradeDecision: {
      action: string;
      reasoning?: string;
      trade?: {
        type: string;
        market: string;
        action: string;
        amount: number;
        reasoning?: string;
      };
    };
    try {
      tradeDecision = JSON.parse(jsonMatch) as {
        action: string;
        reasoning?: string;
        trade?: {
          type: string;
          market: string;
          action: string;
          amount: number;
          reasoning?: string;
        };
      };
    } catch (parseError) {
      throw new Error(
        `Failed to parse JSON trade decision: ${parseError instanceof Error ? parseError.message : String(parseError)}. Response: ${decision.substring(0, 200)}`
      );
    }

    if (tradeDecision.action !== 'trade' || !tradeDecision.trade) {
      logger.info(
        'Agent decided to hold',
        {
          agentUserId,
          reasoning: tradeDecision.reasoning || 'No reasoning provided',
        },
        'AutonomousTrading'
      );
      return {
        tradesExecuted: 0,
        marketId: undefined,
        ticker: undefined,
        side: undefined,
        marketType: undefined,
      }; // Agent decided to hold
    }

    const trade = tradeDecision.trade;
    let tradesExecuted = 0;
    let lastMarketId: string | undefined;
    let lastTicker: string | undefined;
    let lastSide: string | undefined;
    let lastMarketType: 'prediction' | 'perp' | undefined;

    // Cap trade amount to available balance (prevent runaway agents)
    const availableBalance = Number(balance.balance);
    if (trade.amount > availableBalance) {
      logger.warn(
        `[AutonomousTrading] Trade amount capped: $${trade.amount} -> $${availableBalance}`,
        { agentUserId, isNpc },
        'AutonomousTrading'
      );
      trade.amount = availableBalance;
    }

    // Reject if insufficient funds
    if (trade.amount < 1) {
      logger.info(
        `[AutonomousTrading] Insufficient balance for trade`,
        { agentUserId, balance: availableBalance },
        'AutonomousTrading'
      );
      return {
        tradesExecuted: 0,
        marketId: undefined,
        ticker: undefined,
        side: undefined,
        marketType: undefined,
      };
    }

    // Execute the trade based on type
    if (trade.type === 'prediction' && predictionMarkets.length > 0) {
      const market = predictionMarkets.find(
        (m) => m.id === trade.market || m.question.includes(trade.market)
      );
      if (market && trade.amount <= availableBalance) {
        if (trade.action === 'buy_yes' || trade.action === 'buy_no') {
          const side = trade.action === 'buy_yes';

          // Execute buy via internal service
          // NPCs use asSystem (their IDs don't match userId format), Users use asUser
          const tradeOperation = async (
            txDb: Parameters<Parameters<typeof asUser>[1]>[0]
          ) => {
            // Calculate shares and pricing (0.1% fee rate)
            const TRADING_FEE_RATE = 0.001;
            const calculation = PredictionPricing.calculateBuyWithFees(
              Number(market.yesShares),
              Number(market.noShares),
              side ? 'yes' : 'no',
              trade.amount,
              TRADING_FEE_RATE
            );

            // Debit amount from balance (NPCs use ActorState, Users use WalletService)
            if (isNpc) {
              await txDb
                .update(actorState)
                .set({
                  tradingBalance: sql`${actorState.tradingBalance} - ${trade.amount}`,
                })
                .where(eq(actorState.id, agentUserId));
            } else {
              await WalletService.debit(
                agentUserId,
                trade.amount,
                'pred_buy',
                `Bought ${calculation.sharesBought} ${side ? 'YES' : 'NO'} shares: ${market.question}`,
                market.id
              );
            }

            // Update market shares
            await txDb
              .update(markets)
              .set({
                yesShares: side
                  ? sql`${markets.yesShares} + ${calculation.sharesBought}`
                  : String(calculation.newYesShares),
                noShares: side
                  ? String(calculation.newNoShares)
                  : sql`${markets.noShares} + ${calculation.sharesBought}`,
              })
              .where(eq(markets.id, market.id));

            // Create or update position
            const existingPositionResult = await txDb
              .select()
              .from(positions)
              .where(
                and(
                  eq(positions.userId, agentUserId),
                  eq(positions.marketId, market.id)
                )
              )
              .limit(1);
            const existingPosition = existingPositionResult[0];

            let position;
            if (existingPosition) {
              const updatedResult = await txDb
                .update(positions)
                .set({
                  shares: sql`${positions.shares} + ${calculation.sharesBought}`,
                  amount: sql`${positions.amount} + ${trade.amount}`,
                  updatedAt: new Date(),
                })
                .where(eq(positions.id, existingPosition.id))
                .returning();
              position = updatedResult[0];
            } else {
              const insertedResult = await txDb
                .insert(positions)
                .values({
                  id: await generateSnowflakeId(),
                  userId: agentUserId,
                  marketId: market.id,
                  side,
                  shares: String(calculation.sharesBought),
                  avgPrice: String(calculation.avgPrice),
                  amount: String(trade.amount),
                  status: 'active',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                })
                .returning();
              position = insertedResult[0];
            }

            return { position, calculation };
          };

          // Execute with appropriate context (NPCs use asSystem, Users use asUser)
          const result = isNpc
            ? await asSystem(tradeOperation, 'npc_prediction_trade')
            : await asUser({ userId: agentUserId }, tradeOperation);

          // Record in AgentTrade
          await agentPnLService.recordTrade({
            agentId: agentUserId,
            userId: agentManagedBy,
            marketType: 'prediction',
            marketId: market.id,
            action: 'open',
            side: side ? 'yes' : 'no',
            amount: trade.amount,
            price: (result as { calculation: { avgPrice: number } }).calculation
              .avgPrice,
            reasoning: trade.reasoning || undefined,
          });

          tradesExecuted++;
          lastMarketId = market.id;
          lastSide = side ? 'YES' : 'NO';
          lastMarketType = 'prediction';
          logger.info(
            `Agent ${agentDisplayName} bought ${side ? 'YES' : 'NO'} on ${market.question}`,
            undefined,
            'AutonomousTrading'
          );
        }
      }
    } else if (trade.type === 'perp' && perpMarkets.length > 0) {
      const org = perpMarkets.find(
        (o) =>
          o.name === trade.market ||
          o.id === trade.market ||
          o.ticker === trade.market
      );
      if (org && trade.amount <= availableBalance) {
        if (trade.action === 'open_long' || trade.action === 'open_short') {
          const side = trade.action === 'open_long' ? 'long' : 'short';
          // Use org.ticker for PerpMarketSnapshot lookup, fallback to org.name
          const ticker = org.ticker || org.name;

          // Execute perp trade with appropriate context
          const perpTradeOperation = async () => {
            // Create wallet adapter - NPCs use ActorState, Users use WalletService
            const walletAdapter = isNpc
              ? {
                  debit: async ({
                    userId: uid,
                    amount,
                  }: {
                    userId: string;
                    amount: number;
                    reason: string;
                    description?: string;
                    relatedId?: string;
                  }) => {
                    await db
                      .update(actorState)
                      .set({
                        tradingBalance: sql`${actorState.tradingBalance} - ${amount}`,
                      })
                      .where(eq(actorState.id, uid));
                  },
                  credit: async ({
                    userId: uid,
                    amount,
                  }: {
                    userId: string;
                    amount: number;
                    reason: string;
                    description?: string;
                    relatedId?: string;
                  }) => {
                    await db
                      .update(actorState)
                      .set({
                        tradingBalance: sql`${actorState.tradingBalance} + ${amount}`,
                      })
                      .where(eq(actorState.id, uid));
                  },
                  recordPnL: async (_args: {
                    userId: string;
                    pnl: number;
                    reason: string;
                    relatedId?: string;
                  }) => {
                    // NPCs don't track PnL - no-op
                  },
                  getBalance: async (uid: string) => {
                    const [actor] = await db
                      .select({ tradingBalance: actorState.tradingBalance })
                      .from(actorState)
                      .where(eq(actorState.id, uid))
                      .limit(1);
                    return {
                      balance: Number(actor?.tradingBalance ?? 10000),
                      totalDeposited: 0,
                      totalWithdrawn: 0,
                      lifetimePnL: 0,
                    };
                  },
                }
              : {
                  debit: ({
                    userId: uid,
                    amount,
                    reason,
                    description,
                    relatedId,
                  }: {
                    userId: string;
                    amount: number;
                    reason: string;
                    description?: string;
                    relatedId?: string;
                  }) =>
                    WalletService.debit(
                      uid,
                      amount,
                      reason,
                      description ?? '',
                      relatedId
                    ),
                  credit: ({
                    userId: uid,
                    amount,
                    reason,
                    description,
                    relatedId,
                  }: {
                    userId: string;
                    amount: number;
                    reason: string;
                    description?: string;
                    relatedId?: string;
                  }) =>
                    WalletService.credit(
                      uid,
                      amount,
                      reason,
                      description ?? '',
                      relatedId
                    ),
                  recordPnL: async ({
                    userId: uid,
                    pnl,
                    reason,
                    relatedId,
                  }: {
                    userId: string;
                    pnl: number;
                    reason: string;
                    relatedId?: string;
                  }) => {
                    await WalletService.recordPnL(uid, pnl, reason, relatedId);
                  },
                  getBalance: (uid: string) => WalletService.getBalance(uid),
                };

            const service = new PerpMarketService({
              db: new PerpDbAdapter(),
              wallet: walletAdapter,
              fees: {
                tradingFeeRate: 0.001,
                platformShare: 0.5,
                referrerShare: 0.5,
                minFeeAmount: 0.01,
              },
            });

            await service.openPosition({
              userId: agentUserId,
              ticker,
              side,
              size: trade.amount,
              leverage: 1,
            });
          };

          // Execute with appropriate context (NPCs use asSystem, Users use asUser)
          if (isNpc) {
            await asSystem(perpTradeOperation, 'npc_perp_trade');
          } else {
            await asUser({ userId: agentUserId }, perpTradeOperation);
          }

          await agentPnLService.recordTrade({
            agentId: agentUserId,
            userId: agentManagedBy,
            marketType: 'perp',
            ticker,
            action: 'open',
            side,
            amount: trade.amount,
            price: Number(org.currentPrice ?? 0),
            reasoning: trade.reasoning || undefined,
          });

          tradesExecuted++;
          lastTicker = ticker;
          lastSide = side;
          lastMarketType = 'perp';
          logger.info(
            `Agent ${agentDisplayName} opened ${side} position on ${org.name}`,
            undefined,
            'AutonomousTrading'
          );
        }
      }
    }

    return {
      tradesExecuted,
      marketId: lastMarketId,
      ticker: lastTicker,
      side: lastSide,
      marketType: lastMarketType,
    };
  }
}

export const autonomousTradingService = new AutonomousTradingService();
