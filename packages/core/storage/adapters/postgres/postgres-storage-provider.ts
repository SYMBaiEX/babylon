/**
 * PostgreSQL Storage Provider
 * 
 * For production use with PostgreSQL database.
 * 
 * NOTE: For simulation/training without database, use JsonStorageProvider instead.
 * 
 * This is a placeholder that throws helpful errors directing users to use
 * @babylon/db directly for now. A full implementation will require aligning
 * the storage types with the actual database schema.
 */

import type { ActorPort, OrganizationPort } from '../../ports/actors';
import type { AgentPort } from '../../ports/agents';
import type { GamePort } from '../../ports/game';
import type { MarketPort } from '../../ports/markets';
import type { PostPort } from '../../ports/posts';
import type { QuestionPort } from '../../ports/questions';
import type {
  IStorageProvider,
  StorageMode,
} from '../../ports/storage-provider';
import type { TradingPort } from '../../ports/trading';
import type { UserPort } from '../../ports/users';

const NOT_IMPLEMENTED_MSG = 
  'PostgresStorageProvider not yet fully implemented. ' +
  'For production, continue using @babylon/db directly. ' +
  'For simulation/training, use createStorageProvider({ mode: "json" }).';

// Stub implementations that throw helpful errors
class StubActorPort implements ActorPort {
  getActor(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getActors(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getActorsByTier(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getActorState(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getAllActorStates(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  upsertActorState(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateActorBalance(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateActorReputation(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
}

class StubOrganizationPort implements OrganizationPort {
  getOrganization(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getOrganizations(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getOrganizationsByType(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getOrganizationByTicker(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getOrganizationState(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getAllOrganizationStates(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  upsertOrganizationState(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateOrganizationPrice(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
}

class StubAgentPort implements AgentPort {
  getAgentConfig(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createAgentConfig(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateAgentConfig(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  deleteAgentConfig(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getAgentLogs(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createAgentLog(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getAgentMessages(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createAgentMessage(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getAgentPointsTransactions(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createAgentPointsTransaction(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getAgentTrades(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createAgentTrade(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  listAgentsWithAutonomousTrading(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
}

class StubGamePort implements GamePort {
  getGameState(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  initializeGame(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateGameState(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getAllGames(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getRecentEvents(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createEvent(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getEventsByDay(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  recordPriceUpdate(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  recordDailySnapshot(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getPriceHistory(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getDailySnapshots(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
}

class StubMarketPort implements MarketPort {
  getMarket(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getActiveMarkets(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getMarketsByCategory(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createMarket(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateMarket(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  resolveMarket(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateMarketShares(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getMarketSnapshots(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  recordMarketSnapshot(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
}

class StubPostPort implements PostPort {
  getPost(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getRecentPosts(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getPostsByAuthor(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getPostsByType(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createPost(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createManyPosts(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updatePost(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  deletePost(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  incrementLikeCount(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  decrementLikeCount(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  incrementCommentCount(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  incrementRepostCount(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getPostComments(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getTotalPosts(): Promise<number> { throw new Error(NOT_IMPLEMENTED_MSG); }
}

class StubQuestionPort implements QuestionPort {
  getQuestion(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getQuestionByNumber(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getActiveQuestions(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getQuestionsToResolve(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getAllQuestions(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createQuestion(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  resolveQuestion(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateQuestion(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getActiveQuestionCount(): Promise<number> { throw new Error(NOT_IMPLEMENTED_MSG); }
}

class StubTradingPort implements TradingPort {
  getPool(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getPoolByActorId(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createPool(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updatePool(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getPosition(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getOpenPositions(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getOpenPositionsByMarket(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getOpenPositionsByTicker(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createPosition(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updatePosition(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  closePosition(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getNpcTrades(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createNpcTrade(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getRecentNpcTrades(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
}

class StubUserPort implements UserPort {
  getUser(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getUserByUsername(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getUserByWallet(): Promise<null> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createUser(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateUser(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  deleteUser(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getAgentUsers(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getAgentsByManager(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateUserBalance(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  updateUserReputationPoints(): Promise<void> { throw new Error(NOT_IMPLEMENTED_MSG); }
  createPointsTransaction(): Promise<never> { throw new Error(NOT_IMPLEMENTED_MSG); }
  getUserPointsTransactions(): Promise<[]> { throw new Error(NOT_IMPLEMENTED_MSG); }
  userExists(): Promise<boolean> { throw new Error(NOT_IMPLEMENTED_MSG); }
}

export class PostgresStorageProvider implements IStorageProvider {
  readonly mode: StorageMode = 'postgres';
  
  readonly actors: ActorPort = new StubActorPort();
  readonly organizations: OrganizationPort = new StubOrganizationPort();
  readonly agents: AgentPort = new StubAgentPort();
  readonly game: GamePort = new StubGamePort();
  readonly markets: MarketPort = new StubMarketPort();
  readonly posts: PostPort = new StubPostPort();
  readonly questions: QuestionPort = new StubQuestionPort();
  readonly trading: TradingPort = new StubTradingPort();
  readonly users: UserPort = new StubUserPort();
  
  async initialize(): Promise<void> {
    // In postgres mode, the database is managed by @babylon/db
    // This provider exists mainly for interface compatibility
  }
  
  async shutdown(): Promise<void> {
    // Database connection managed by @babylon/db
  }
  
  async isHealthy(): Promise<boolean> {
    // Would need to import @babylon/db to check health
    // For now, assume healthy if we got this far
    return true;
  }
}
