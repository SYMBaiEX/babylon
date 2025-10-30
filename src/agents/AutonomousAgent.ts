/**
 * Autonomous Agent
 *
 * Autonomous agent that connects to the Babylon game via A2A protocol.
 * Can analyze markets, make predictions, and coordinate with other agents.
 */

import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { A2AClient } from '../a2a/client/a2a-client';
import { BabylonLLMClient } from '../generator/llm/openai-client';
import type {
  AgentCapabilities,
  MarketAnalysis,
  A2AEventType
} from '../a2a/types';
import type { Question } from '@/shared/types';

export interface AgentConfig {
  name: string;
  personality: string;
  strategies: string[];
  riskTolerance: number; // 0-1
  analysisDepth: 'quick' | 'moderate' | 'deep';
  a2aEndpoint: string;
  privateKey?: string; // Optional, will generate if not provided
}

export interface AgentAnalysisResult {
  questionId: number;
  prediction: boolean;
  confidence: number;
  reasoning: string;
  timestamp: number;
}

export class AutonomousAgent extends EventEmitter {
  private config: AgentConfig;
  private a2aClient: A2AClient;
  private llm: BabylonLLMClient;
  private wallet: ethers.Wallet | ethers.HDNodeWallet;
  private activeQuestions: Map<number, Question> = new Map();
  private analyses: Map<number, AgentAnalysisResult> = new Map();
  private coalitions: Set<string> = new Set();
  private isConnected = false;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.llm = new BabylonLLMClient();

    // Create or use provided wallet
    this.wallet = config.privateKey
      ? new ethers.Wallet(config.privateKey)
      : ethers.Wallet.createRandom();

    // Create A2A client
    const capabilities: AgentCapabilities = {
      strategies: config.strategies,
      markets: ['prediction'],
      actions: ['analyze', 'predict', 'coordinate'],
      version: '1.0.0'
    };

    this.a2aClient = new A2AClient({
      endpoint: config.a2aEndpoint,
      credentials: {
        address: this.wallet.address,
        privateKey: this.wallet.privateKey,
        tokenId: 0 // Could be assigned from NFT registry
      },
      capabilities,
      autoReconnect: true,
      reconnectInterval: 5000,
      heartbeatInterval: 30000
    });

    this.setupEventHandlers();
  }

  /**
   * Setup A2A client event handlers
   */
  private setupEventHandlers(): void {
    // Connection events
    this.a2aClient.on(A2AEventType.AGENT_CONNECTED, (data) => {
      this.isConnected = true;
      console.log(`✅ ${this.config.name} connected as ${data.agentId}`);
      this.emit('connected', data);
    });

    this.a2aClient.on(A2AEventType.AGENT_DISCONNECTED, () => {
      this.isConnected = false;
      console.log(`❌ ${this.config.name} disconnected`);
      this.emit('disconnected');
    });

    // Market data updates
    this.a2aClient.on('notification', async (notification) => {
      if (notification.method === 'a2a.marketUpdate') {
        await this.handleMarketUpdate(notification.params);
      } else if (notification.method === 'a2a.gameEvent') {
        await this.handleGameEvent(notification.params);
      } else if (notification.method === 'a2a.coalitionInvite') {
        await this.handleCoalitionInvite(notification.params);
      }
    });

    // Error handling
    this.a2aClient.on('error', (error) => {
      console.error(`⚠️  ${this.config.name} error:`, error);
      this.emit('error', error);
    });
  }

  /**
   * Connect to the A2A server
   */
  async connect(): Promise<void> {
    try {
      await this.a2aClient.connect();
    } catch (error) {
      console.error(`Failed to connect ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from the A2A server
   */
  async disconnect(): Promise<void> {
    await this.a2aClient.disconnect();
    this.isConnected = false;
  }

  /**
   * Handle market data update
   */
  private async handleMarketUpdate(data: any): Promise<void> {
    const { questions, priceUpdates, timestamp } = data;

    // Update active questions
    for (const question of questions) {
      this.activeQuestions.set(question.id, question);
    }

    // Analyze new or updated questions
    for (const question of questions) {
      if (!this.analyses.has(question.id)) {
        await this.analyzeQuestion(question);
      }
    }

    this.emit('marketUpdate', { questions, priceUpdates, timestamp });
  }

  /**
   * Handle game event
   */
  private async handleGameEvent(event: any): Promise<void> {
    console.log(`📢 ${this.config.name} received event: ${event.type}`);

    // If event affects a question we're tracking, re-analyze
    if (event.relatedQuestion && this.activeQuestions.has(event.relatedQuestion)) {
      const question = this.activeQuestions.get(event.relatedQuestion)!;
      await this.analyzeQuestion(question);
    }

    this.emit('gameEvent', event);
  }

  /**
   * Handle coalition invite
   */
  private async handleCoalitionInvite(invite: any): Promise<void> {
    console.log(`🤝 ${this.config.name} invited to coalition: ${invite.name}`);

    // Simple acceptance logic based on strategy match
    const shouldJoin = this.config.strategies.includes(invite.strategy);

    if (shouldJoin) {
      try {
        const result = await this.a2aClient.joinCoalition(invite.coalitionId);
        if (result.joined) {
          this.coalitions.add(invite.coalitionId);
          console.log(`✅ ${this.config.name} joined coalition: ${invite.name}`);
          this.emit('coalitionJoined', invite);
        }
      } catch (error) {
        console.error(`Failed to join coalition:`, error);
      }
    }
  }

  /**
   * Analyze a question using LLM
   */
  private async analyzeQuestion(question: Question): Promise<void> {
    try {
      // Build analysis prompt based on agent personality and question
      const prompt = this.buildAnalysisPrompt(question);

      // Get LLM analysis
      const response = await this.llm.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 500
      });

      // Parse analysis (simplified - could use structured output)
      const analysis = this.parseAnalysis(response, question);

      // Store analysis
      this.analyses.set(question.id, analysis);

      // Share with other agents if confidence is high
      if (analysis.confidence > 0.7) {
        await this.shareAnalysis(analysis);
      }

      this.emit('analysisComplete', analysis);
    } catch (error) {
      console.error(`Analysis failed for question ${question.id}:`, error);
    }
  }

  /**
   * Build analysis prompt for LLM
   */
  private buildAnalysisPrompt(question: Question): string {
    return `You are ${this.config.name}, an autonomous prediction market agent with the following characteristics:

Personality: ${this.config.personality}
Strategies: ${this.config.strategies.join(', ')}
Risk Tolerance: ${this.config.riskTolerance}

Analyze this prediction market question:
Question: ${question.text}
Current Yes Price: ${question.yesPrice}
Current No Price: ${question.noPrice}
Total Volume: ${question.totalVolume}
Closes: ${new Date(question.closeDate).toLocaleString()}

Provide your analysis in the following format:
PREDICTION: YES or NO
CONFIDENCE: 0.0 to 1.0
REASONING: Brief explanation of your prediction

Be concise and direct.`;
  }

  /**
   * Parse LLM response into structured analysis
   */
  private parseAnalysis(response: string, question: Question): AgentAnalysisResult {
    // Simple parsing - could be more sophisticated
    const lines = response.split('\n');
    let prediction = false;
    let confidence = 0.5;
    let reasoning = '';

    for (const line of lines) {
      if (line.includes('PREDICTION:')) {
        prediction = line.includes('YES');
      } else if (line.includes('CONFIDENCE:')) {
        const match = line.match(/(\d+\.?\d*)/);
        if (match) confidence = parseFloat(match[1]);
      } else if (line.includes('REASONING:')) {
        reasoning = line.replace('REASONING:', '').trim();
      } else if (reasoning && line.trim()) {
        reasoning += ' ' + line.trim();
      }
    }

    return {
      questionId: question.id,
      prediction,
      confidence: Math.min(Math.max(confidence, 0), 1), // Clamp 0-1
      reasoning: reasoning || 'No reasoning provided',
      timestamp: Date.now()
    };
  }

  /**
   * Share analysis with other agents via A2A
   */
  private async shareAnalysis(analysis: AgentAnalysisResult): Promise<void> {
    try {
      const marketAnalysis: MarketAnalysis = {
        marketId: `question-${analysis.questionId}`,
        analyst: this.a2aClient.getAgentId()!,
        prediction: analysis.prediction ? 1 : 0,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        dataPoints: {},
        timestamp: analysis.timestamp
      };

      await this.a2aClient.shareAnalysis(marketAnalysis);
      console.log(`📊 ${this.config.name} shared analysis for question ${analysis.questionId}`);
    } catch (error) {
      console.error('Failed to share analysis:', error);
    }
  }

  /**
   * Propose a coalition to coordinate with other agents
   */
  async proposeCoalition(
    name: string,
    targetMarket: string,
    minMembers: number = 2,
    maxMembers: number = 5
  ): Promise<string | null> {
    if (!this.isConnected) {
      console.error('Not connected to A2A server');
      return null;
    }

    try {
      const strategy = this.config.strategies[0] || 'general';
      const result = await this.a2aClient.proposeCoalition(
        name,
        targetMarket,
        strategy,
        minMembers,
        maxMembers
      );

      this.coalitions.add(result.coalitionId);
      console.log(`🤝 ${this.config.name} created coalition: ${name}`);
      return result.coalitionId;
    } catch (error) {
      console.error('Failed to propose coalition:', error);
      return null;
    }
  }

  /**
   * Get agent status
   */
  getStatus(): {
    name: string;
    connected: boolean;
    agentId: string | null;
    address: string;
    questionsTracked: number;
    analysesComplete: number;
    coalitions: number;
  } {
    return {
      name: this.config.name,
      connected: this.isConnected,
      agentId: this.a2aClient.getAgentId(),
      address: this.wallet.address,
      questionsTracked: this.activeQuestions.size,
      analysesComplete: this.analyses.size,
      coalitions: this.coalitions.size
    };
  }

  /**
   * Get analysis for a specific question
   */
  getAnalysis(questionId: number): AgentAnalysisResult | undefined {
    return this.analyses.get(questionId);
  }

  /**
   * Get all analyses
   */
  getAllAnalyses(): AgentAnalysisResult[] {
    return Array.from(this.analyses.values());
  }
}
