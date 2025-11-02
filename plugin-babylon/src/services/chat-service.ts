import { Service, type IAgentRuntime, logger } from '@elizaos/core'
import { BabylonApiClient } from '../api-client'
import { BabylonClientService } from '../plugin'

export class BabylonChatService extends Service {
  static override serviceType = 'babylon_chat' as const

  override capabilityDescription =
    'Babylon chat service for automated participation in chat rooms based on themes'

  private chatInterval?: NodeJS.Timeout
  private apiClient?: BabylonApiClient

  constructor(runtime: IAgentRuntime) {
    super(runtime)
  }

  static override async start(
    runtime: IAgentRuntime,
  ): Promise<BabylonChatService> {
    logger.info('Starting BabylonChatService')
    const service = new BabylonChatService(runtime)
    await service.initialize()
    return service
  }

  async initialize(): Promise<void> {
    const babylonService = this.runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    )
    if (!babylonService) {
      this.runtime.logger.error(
        'Babylon client service not available - chat service will not start',
      )
      return
    }
    this.apiClient = babylonService.getClient()
    this.runtime.logger.info('🚀 Initializing Babylon Chat Service...')
    this.chatInterval = setInterval(
      () => this.postRandomMessage(),
      2 * 60 * 1000,
    ) // Every 2 minutes
    this.runtime.logger.info('✅ Babylon Chat Service initialized')
  }

  private async postRandomMessage(): Promise<void> {
    if (!this.apiClient) {
      return
    }

    try {
      this.runtime.logger.info('🤖 Checking for a random chat to post in...')
      const chats = await this.apiClient.getChats()

      if (chats.length === 0) {
        this.runtime.logger.info('No active chats to post in.')
        return
      }

      const randomChat = chats[Math.floor(Math.random() * chats.length)]
      if (!randomChat) {
        return
      }

      const messageContent = await this.generateChatMessage(randomChat.theme)

      if (messageContent) {
        await this.apiClient.sendMessage(randomChat.id, messageContent)
        this.runtime.logger.info(
          `📬 Posted message to chat "${randomChat.name}": "${messageContent}"`,
        )
      }
    } catch (error) {
      this.runtime.logger.error(
        `Error posting random message: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async generateChatMessage(theme: string): Promise<string | null> {
    // Simple message generation based on theme
    // TODO: Integrate with LLM for more dynamic content
    const messages = [
      `Interesting topic about ${theme}! What are your thoughts?`,
      `I've been thinking about ${theme} lately. Anyone want to discuss?`,
      `${theme} is such a fascinating subject. Let's explore it together!`,
      `Has anyone considered the implications of ${theme}?`,
      `I'd love to hear different perspectives on ${theme}.`,
    ]
    const message = messages[Math.floor(Math.random() * messages.length)]
    return message || null
  }

  override async stop(): Promise<void> {
    this.runtime.logger.info('🛑 Stopping Babylon Chat Service...')
    if (this.chatInterval) {
      clearInterval(this.chatInterval)
      this.chatInterval = undefined
    }
    this.runtime.logger.info('✅ Babylon Chat Service stopped')
  }
}
