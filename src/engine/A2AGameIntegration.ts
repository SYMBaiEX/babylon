/**
 * A2A Game Integration
 *
 * Integrates the A2A protocol with the Babylon game engine to enable:
 * - Autonomous agent-to-agent communication
 * - Market data sharing between agents
 * - Coalition formation for coordinated strategies
 * - Distributed prediction market intelligence
 */

import { EventEmitter } from 'events';
import { A2AWebSocketServer } from '../a2a/server';
import { RegistryClient } from '../a2a/blockchain';
import type {
  Question,
  PriceUpdate,
  SelectedActor,
  FeedPost
} from '@/shared/types';
import type {
  A2AServerConfig,
  AgentConnection
} from '../a2a/types';

export interface A2AGameConfig {
  enabled: boolean;
  port?: number;
  host?: string;
  maxConnections?: number;
  enableBlockchain?: boolean;
  rpcUrl?: string;
  identityRegistryAddress?: string;
  reputationSystemAddress?: string;
}

export interface MarketDataBroadcast {
  type: 'market_update';
  timestamp: number;
  questions: Question[];
  priceUpdates: PriceUpdate[];
  activeMarkets: number;
}

export interface AgentAnalysis {
  agentId: string;
  questionId: number;
  prediction: boolean;
  confidence: number;
  reasoning: string;
  timestamp: number;
}

export interface Coalition {
  id: string;
  name: string;
  members: string[];
  strategy: string;
  createdAt: number;
  active: boolean;
}

export class A2AGameIntegration extends EventEmitter {
  private server?: A2AWebSocketServer;
  private config: Required<A2AGameConfig>;
  private registryClient?: RegistryClient;
  private coalitions: Map<string, Coalition> = new Map();
  private agentAnalyses: Map<number, AgentAnalysis[]> = new Map();

  constructor(config?: A2AGameConfig) {
    super();

    this.config = {
      enabled: config?.enabled ?? false,
      port: config?.port ?? 8080,
      host: config?.host ?? '0.0.0.0',
      maxConnections: config?.maxConnections ?? 1000,
      enableBlockchain: config?.enableBlockchain ?? false,
      rpcUrl: config?.rpcUrl ?? process.env.BASE_SEPOLIA_RPC_URL ?? '',
      identityRegistryAddress: config?.identityRegistryAddress ?? process.env.IDENTITY_REGISTRY_ADDRESS ?? '',
      reputationSystemAddress: config?.reputationSystemAddress ?? process.env.REPUTATION_SYSTEM_ADDRESS ?? '',
    };
  }

  /**
   * Initialize the A2A integration
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('⏭️  A2A integration disabled');
      return;
    }

    console.log('\n🌐 INITIALIZING A2A PROTOCOL');
    console.log('==============================');

    // Set up blockchain registry if enabled
    if (this.config.enableBlockchain && this.config.rpcUrl) {
      try {
        this.registryClient = new RegistryClient({
          rpcUrl: this.config.rpcUrl,
          identityRegistryAddress: this.config.identityRegistryAddress,
          reputationSystemAddress: this.config.reputationSystemAddress,
        });
        console.log('✅ Blockchain registry connected');
      } catch (error) {
        console.warn('⚠️  Blockchain registry unavailable, continuing without it');
      }
    }

    // Create A2A WebSocket server
    const serverConfig: A2AServerConfig = {
      port: this.config.port,
      host: this.config.host,
      maxConnections: this.config.maxConnections,
      messageRateLimit: 100,
      authTimeout: 30000,
      enableX402: true,
      enableCoalitions: true,
      logLevel: 'info',
      registryClient: this.registryClient,
    };

    this.server = new A2AWebSocketServer(serverConfig);
    await this.server.waitForReady();

    // Set up event handlers
    this.setupServerEventHandlers();

    console.log(`✅ A2A server listening on ws://${this.config.host}:${this.config.port}`);
    console.log('');
  }

  /**
   * Set up A2A server event handlers
   */
  private setupServerEventHandlers(): void {
    if (!this.server) return;

    this.server.on('agent.connected', (data) => {
      console.log(`🤝 Agent connected: ${data.agentId}`);
      this.emit('agent.connected', data);
    });

    this.server.on('agent.disconnected', (data) => {
      console.log(`👋 Agent disconnected: ${data.agentId}`);
      this.emit('agent.disconnected', data);
    });

    // Handle agent analysis sharing
    this.server.on('message', (data) => {
      if (data.method === 'a2a.shareAnalysis') {
        this.handleAnalysisShare(data);
      } else if (data.method === 'a2a.proposeCoalition') {
        this.handleCoalitionProposal(data);
      }
    });
  }

  /**
   * Broadcast market data to all connected agents
   */
  broadcastMarketData(questions: Question[], priceUpdates: PriceUpdate[]): void {
    if (!this.server) return;

    const broadcast: MarketDataBroadcast = {
      type: 'market_update',
      timestamp: Date.now(),
      questions: questions.filter(q => q.status === 'active'),
      priceUpdates: priceUpdates.slice(-10), // Last 10 updates
      activeMarkets: questions.filter(q => q.status === 'active').length,
    };

    this.server.broadcastAll({
      jsonrpc: '2.0',
      method: 'a2a.marketUpdate',
      params: broadcast,
    });
  }

  /**
   * Broadcast game events to agents
   */
  broadcastGameEvent(event: {
    type: string;
    description: string;
    relatedQuestion?: number;
    timestamp: number;
  }): void {
    if (!this.server) return;

    this.server.broadcastAll({
      jsonrpc: '2.0',
      method: 'a2a.gameEvent',
      params: event,
    });
  }

  /**
   * Handle agent analysis sharing
   */
  private handleAnalysisShare(data: any): void {
    try {
      const analysis: AgentAnalysis = {
        agentId: data.agentId,
        questionId: data.params.questionId,
        prediction: data.params.prediction,
        confidence: data.params.confidence,
        reasoning: data.params.reasoning,
        timestamp: Date.now(),
      };

      // Store analysis
      const questionAnalyses = this.agentAnalyses.get(analysis.questionId) || [];
      questionAnalyses.push(analysis);
      this.agentAnalyses.set(analysis.questionId, questionAnalyses);

      // Emit event for game engine to process
      this.emit('agent.analysis', analysis);

      console.log(`📊 Agent ${analysis.agentId} shared analysis for question ${analysis.questionId}`);
    } catch (error) {
      console.error('Error handling analysis share:', error);
    }
  }

  /**
   * Handle coalition proposals
   */
  private handleCoalitionProposal(data: any): void {
    try {
      const coalition: Coalition = {
        id: `coalition-${Date.now()}`,
        name: data.params.name,
        members: [data.agentId, ...data.params.invitedAgents],
        strategy: data.params.strategy,
        createdAt: Date.now(),
        active: true,
      };

      this.coalitions.set(coalition.id, coalition);

      // Broadcast to invited agents
      this.server?.broadcast(data.params.invitedAgents, {
        jsonrpc: '2.0',
        method: 'a2a.coalitionInvite',
        params: {
          coalitionId: coalition.id,
          proposer: data.agentId,
          name: coalition.name,
          strategy: coalition.strategy,
        },
      });

      this.emit('coalition.created', coalition);
      console.log(`🤝 Coalition "${coalition.name}" created by ${data.agentId}`);
    } catch (error) {
      console.error('Error handling coalition proposal:', error);
    }
  }

  /**
   * Get agent analyses for a specific question
   */
  getQuestionAnalyses(questionId: number): AgentAnalysis[] {
    return this.agentAnalyses.get(questionId) || [];
  }

  /**
   * Get consensus prediction for a question based on agent analyses
   */
  getConsensusPrediction(questionId: number): {
    prediction: boolean;
    confidence: number;
    agentCount: number;
  } | null {
    const analyses = this.getQuestionAnalyses(questionId);
    if (analyses.length === 0) return null;

    const yesVotes = analyses.filter(a => a.prediction).length;
    const totalVotes = analyses.length;
    const avgConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / totalVotes;

    return {
      prediction: yesVotes > totalVotes / 2,
      confidence: avgConfidence,
      agentCount: totalVotes,
    };
  }

  /**
   * Get all active coalitions
   */
  getActiveCoalitions(): Coalition[] {
    return Array.from(this.coalitions.values()).filter(c => c.active);
  }

  /**
   * Get connected agents
   */
  getConnectedAgents(): AgentConnection[] {
    return this.server?.getConnectedAgents() || [];
  }

  /**
   * Get agent count
   */
  getAgentCount(): number {
    return this.getConnectedAgents().length;
  }

  /**
   * Shutdown the A2A integration
   */
  async shutdown(): Promise<void> {
    if (!this.server) return;

    console.log('\n🔌 Shutting down A2A server...');
    await this.server.close();
    console.log('✅ A2A server closed');
  }

  /**
   * Get integration status
   */
  getStatus(): {
    enabled: boolean;
    agentCount: number;
    coalitionCount: number;
    analysesCount: number;
  } {
    return {
      enabled: this.config.enabled,
      agentCount: this.getAgentCount(),
      coalitionCount: this.getActiveCoalitions().length,
      analysesCount: Array.from(this.agentAnalyses.values()).reduce((sum, arr) => sum + arr.length, 0),
    };
  }
}
