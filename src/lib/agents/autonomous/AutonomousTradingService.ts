/**
 * Autonomous Trading Service
 * 
 * Handles agents making REAL trades on prediction markets and perps
 */

import { db, users, positions, perpPositions, markets, organizations, eq, and, isNull, gte, desc, sql } from '@/db'
import { logger } from '@/lib/logger'
import type { IAgentRuntime } from '@elizaos/core'
import { callGroqDirect } from '../llm/direct-groq'
import { PerpTradeService } from '@/lib/services/perp-trade-service'
import { WalletService } from '@/lib/services/wallet-service'
import { PredictionPricing } from '@/lib/prediction-pricing'
import { asUser } from '@/lib/db/context'
import { generateSnowflakeId } from '@/lib/snowflake'
import { agentPnLService } from '../services/AgentPnLService'
import { generateRandomMarketContext, formatRandomContext } from '@/lib/prompts/random-context'
import { shuffleArray } from '@/lib/utils/randomization'
import { countTokensSync, truncateToTokenLimitSync } from '@/lib/token-counter'

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
  async executeTrades(agentUserId: string, _runtime: IAgentRuntime): Promise<{
    tradesExecuted: number;
    marketId?: string;
    ticker?: string;
    side?: string;
    marketType?: 'prediction' | 'perp';
  }> {
    const agentResult = await db.select().from(users).where(eq(users.id, agentUserId)).limit(1)
    const agent = agentResult[0]

    if (!agent?.isAgent) {
      throw new Error('Agent not found')
    }

    // Get agent's positions separately
    const positionsResult = await db.select().from(positions).where(and(
      eq(positions.userId, agentUserId),
      eq(positions.status, 'active')
    ))

    const perpPositionsResult = await db.select().from(perpPositions).where(and(
      eq(perpPositions.userId, agentUserId),
      isNull(perpPositions.closedAt)
    ))

    // Get current markets
    const predictionMarkets = await db.select().from(markets).where(and(
      eq(markets.resolved, false),
      gte(markets.endDate, new Date())
    )).orderBy(desc(markets.createdAt)).limit(10)

    const perpMarkets = await db.select().from(organizations).where(eq(organizations.type, 'org')).orderBy(desc(organizations.currentPrice)).limit(10)

    const balance = await WalletService.getBalance(agentUserId)

    // Shuffle markets to add variety to prompts
    const shuffledPredictions = shuffleArray(predictionMarkets)
    const shuffledPerps = shuffleArray(perpMarkets)

    // Get random market context for variety
    const marketContext = await generateRandomMarketContext({
      includeGainers: true,
      includeLosers: true,
      includeQuestions: true,
      includePosts: false,
      includeEvents: true,
    })
    const contextString = formatRandomContext(marketContext)

    // Build trading decision prompt
    // Note: NPC trust scores are provided by experiencePlugin (marketOutcomeEvaluator)
    // and will appear in agent context automatically via providers
    const prompt = `${agent.agentSystem}

You are ${agent.displayName}, an autonomous trading agent.

Trading Strategy: ${agent.agentTradingStrategy || 'General market analysis'}

Current Status:
- Balance: $${balance.balance}
- P&L: ${agent.lifetimePnL}
- Open Positions: ${positionsResult.length + perpPositionsResult.length}

Available Prediction Markets:
${shuffledPredictions.slice(0, 5).map(m => `- ${m.question} (YES: ${m.yesShares}, NO: ${m.noShares})`).join('\n')}

Available Perp Markets:
${shuffledPerps.slice(0, 5).map(o => `- ${o.name} @ $${o.currentPrice}`).join('\n')}

Your Open Positions:
${positionsResult.map(p => `- Prediction: ${p.marketId}, ${p.side ? 'YES' : 'NO'}, ${p.shares} shares`).join('\n') || 'None'}
${perpPositionsResult.map(p => `- Perp: ${p.ticker}, ${p.side}, $${p.size}, ${p.leverage}x`).join('\n') || 'None'}

Decide if you should make any trades this tick.
Respond in JSON format:
{
  "action": "trade" | "hold",
  "trade": {
    "type": "prediction" | "perp",
    "market": "id or ticker",
    "action": "buy_yes" | "buy_no" | "sell" | "open_long" | "open_short" | "close",
    "amount": number,
    "reasoning": "why (mention trust scores if relevant)"
  }
}

Only trade if you have strong conviction and sufficient balance.
${contextString}`

    // Ensure prompt fits within 32K context limit (W&B trained models)
    const estimatedTokens = countTokensSync(prompt)
    let finalPrompt = prompt
    
    if (estimatedTokens > 30000) {  // 30K with 2K safety margin
      logger.warn(`Trading prompt too long: ${estimatedTokens} tokens, truncating`, { agentUserId })
      const truncated = truncateToTokenLimitSync(prompt, 30000, { ellipsis: true })
      finalPrompt = truncated.text
      logger.info(`Truncated to ${truncated.tokens} tokens`, { agentUserId })
    }

    // Use large model (qwen3-32b or trained W&B model) for trading decisions
    // Add timeout to prevent hanging (30 seconds max)
    const decision = await Promise.race([
      callGroqDirect({
        prompt: finalPrompt,
        system: agent.agentSystem || undefined,
        modelSize: 'large',  // Uses trained W&B model if available, else qwen3-32b
        runtime: _runtime,  // Pass runtime to access W&B trained models
        temperature: 0.7,
        maxTokens: 300,
        actionType: 'evaluate_trading_opportunity'
      }),
      new Promise<string>((resolve) => {
        setTimeout(() => {
          logger.warn(`Trading decision timeout for agent ${agentUserId}, defaulting to hold`, undefined, 'AutonomousTrading')
          resolve('{"action": "hold"}')
        }, 30000) // 30 second timeout
      })
    ])

    const jsonMatch = decision.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error(`Failed to parse trade decision JSON from LLM response: ${decision.substring(0, 200)}`)
    }
    
    let tradeDecision: { action: string; trade?: {type: string; market: string; action: string; amount: number; reasoning?: string } }
    try {
      tradeDecision = JSON.parse(jsonMatch[0]) as { action: string; trade?: {type: string; market: string; action: string; amount: number; reasoning?: string } }
    } catch (parseError) {
      throw new Error(`Failed to parse JSON trade decision: ${parseError instanceof Error ? parseError.message : String(parseError)}. Response: ${decision.substring(0, 200)}`)
    }

    if (tradeDecision.action !== 'trade' || !tradeDecision.trade) {
      return {
        tradesExecuted: 0,
        marketId: undefined,
        ticker: undefined,
        side: undefined,
        marketType: undefined
      } // Agent decided to hold
    }

    const trade = tradeDecision.trade
    let tradesExecuted = 0
    let lastMarketId: string | undefined
    let lastTicker: string | undefined
    let lastSide: string | undefined
    let lastMarketType: 'prediction' | 'perp' | undefined

    // Execute the trade based on type
    if (trade.type === 'prediction' && predictionMarkets.length > 0) {
      const market = predictionMarkets.find(m => m.id === trade.market || m.question.includes(trade.market))
      if (market && trade.amount <= Number(balance.balance)) {
        if (trade.action === 'buy_yes' || trade.action === 'buy_no') {
            const side = trade.action === 'buy_yes'
            
            // Execute buy via internal service
            const result = await asUser({ userId: agentUserId }, async (txDb) => {
              // Calculate shares and pricing
              const calculation = PredictionPricing.calculateBuyWithFees(
                Number(market.yesShares),
                Number(market.noShares),
                side ? 'yes' : 'no',
                trade.amount
              )

              // Debit amount from balance
              await WalletService.debit(
                agentUserId,
                trade.amount,
                'pred_buy',
                `Bought ${calculation.sharesBought} ${side ? 'YES' : 'NO'} shares: ${market.question}`,
                market.id
              )

              // Update market shares
              await txDb.update(markets).set({
                yesShares: side 
                  ? sql`${markets.yesShares} + ${calculation.sharesBought}`
                  : String(calculation.newYesShares),
                noShares: side
                  ? String(calculation.newNoShares)
                  : sql`${markets.noShares} + ${calculation.sharesBought}`,
              }).where(eq(markets.id, market.id))

              // Create or update position
              const existingPositionResult = await txDb.select().from(positions).where(and(
                eq(positions.userId, agentUserId),
                eq(positions.marketId, market.id)
              )).limit(1)
              const existingPosition = existingPositionResult[0]

              let position
              if (existingPosition) {
                const updatedResult = await txDb.update(positions).set({
                  shares: sql`${positions.shares} + ${calculation.sharesBought}`,
                  amount: sql`${positions.amount} + ${trade.amount}`,
                  updatedAt: new Date()
                }).where(eq(positions.id, existingPosition.id)).returning()
                position = updatedResult[0]
              } else {
                const insertedResult = await txDb.insert(positions).values({
                  id: await generateSnowflakeId(),
                  userId: agentUserId,
                  marketId: market.id,
                  side,
                  shares: String(calculation.sharesBought),
                  avgPrice: String(calculation.avgPrice),
                  amount: String(trade.amount),
                  status: 'active',
                  createdAt: new Date(),
                  updatedAt: new Date()
                }).returning()
                position = insertedResult[0]
              }

              return { position, calculation }
            })

            // Record in AgentTrade
            await agentPnLService.recordTrade({
              agentId: agentUserId,
              userId: agent.managedBy || agentUserId,
              marketType: 'prediction',
              marketId: market.id,
              action: 'open',
              side: side ? 'yes' : 'no',
              amount: trade.amount,
              price: (result as { calculation: { avgPrice: number } }).calculation.avgPrice,
              reasoning: trade.reasoning || undefined
            })

            tradesExecuted++
            lastMarketId = market.id
            lastSide = side ? 'YES' : 'NO'
            lastMarketType = 'prediction'
            logger.info(`Agent ${agent.displayName} bought ${side ? 'YES' : 'NO'} on ${market.question}`, undefined, 'AutonomousTrading')
          }
      }
    } else if (trade.type === 'perp' && perpMarkets.length > 0) {
      const org = perpMarkets.find(o => o.name === trade.market || o.id === trade.market)
      if (org && trade.amount <= Number(balance.balance)) {
        if (trade.action === 'open_long' || trade.action === 'open_short') {
            const side = trade.action === 'open_long' ? 'long' : 'short'
            // Use org.name as ticker (Organization model doesn't have ticker field, name is used as ticker)
            const ticker = org.name
            
            await asUser({ userId: agentUserId }, async () => {
              await PerpTradeService.openPosition(
                { userId: agentUserId },
                {
                  ticker,
                  side,
                  size: trade.amount,
                  leverage: 1
                }
              )
            })

            await agentPnLService.recordTrade({
              agentId: agentUserId,
              userId: agent.managedBy || agentUserId,
              marketType: 'perp',
              ticker: org.name, // Use org.name as ticker
              action: 'open',
              side,
              amount: trade.amount,
              price: Number(org.currentPrice ?? 0),
              reasoning: trade.reasoning || undefined
            })

            tradesExecuted++
            lastTicker = org.name // Use org.name as ticker
            lastSide = side
            lastMarketType = 'perp'
            logger.info(`Agent ${agent.displayName} opened ${side} position on ${org.name}`, undefined, 'AutonomousTrading')
          }
      }
    }

    return {
      tradesExecuted,
      marketId: lastMarketId,
      ticker: lastTicker,
      side: lastSide,
      marketType: lastMarketType
    }
  }
}

export const autonomousTradingService = new AutonomousTradingService()
