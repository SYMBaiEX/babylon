/**
 * Agent Event Bus
 *
 * Provides pub/sub event system for agent communication
 * Supports real-time event broadcasting and subscriptions
 *
 * @see agent-patch-plan.md Phase 3.2
 */

export type EventHandler<T = any> = (data: T) => void | Promise<void>

export interface AgentEvent<T = any> {
  type: string
  agentId?: string
  data: T
  timestamp: Date
  metadata?: Record<string, any>
}

export interface Subscription {
  id: string
  eventType: string
  handler: EventHandler
  filter?: (event: AgentEvent) => boolean
}

/**
 * Event Bus for Agent Communication
 * Thread-safe pub/sub system with filtering and wildcards
 */
export class EventBus {
  private subscriptions: Map<string, Subscription[]> = new Map()
  private eventHistory: AgentEvent[] = []
  private maxHistorySize: number

  constructor(maxHistorySize: number = 1000) {
    this.maxHistorySize = maxHistorySize
  }

  /**
   * Subscribe to events of a specific type
   *
   * @param eventType - Event type to subscribe to (supports wildcards with *)
   * @param handler - Event handler function
   * @param filter - Optional filter function
   * @returns Subscription ID for unsubscribing
   */
  subscribe<T = any>(
    eventType: string,
    handler: EventHandler<T>,
    filter?: (event: AgentEvent<T>) => boolean,
  ): string {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const subscription: Subscription = {
      id: subscriptionId,
      eventType,
      handler,
      filter,
    }

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, [])
    }

    this.subscriptions.get(eventType)!.push(subscription)

    return subscriptionId
  }

  /**
   * Unsubscribe from events
   *
   * @param subscriptionId - Subscription ID returned from subscribe()
   */
  unsubscribe(subscriptionId: string): void {
    for (const [eventType, subs] of this.subscriptions.entries()) {
      const index = subs.findIndex(s => s.id === subscriptionId)
      if (index !== -1) {
        subs.splice(index, 1)
        if (subs.length === 0) {
          this.subscriptions.delete(eventType)
        }
        return
      }
    }
  }

  /**
   * Publish an event to all subscribers
   *
   * @param eventType - Event type
   * @param data - Event data
   * @param agentId - Optional agent ID that triggered the event
   * @param metadata - Optional metadata
   */
  async publish<T = any>(
    eventType: string,
    data: T,
    agentId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const event: AgentEvent<T> = {
      type: eventType,
      agentId,
      data,
      timestamp: new Date(),
      metadata,
    }

    // Add to history
    this.eventHistory.push(event)
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift()
    }

    // Find matching subscriptions
    const matchingSubs = this.getMatchingSubscriptions(eventType)

    // Execute handlers
    const promises: Promise<void>[] = []
    for (const sub of matchingSubs) {
      // Apply filter if present
      if (sub.filter && !sub.filter(event)) {
        continue
      }

      // Execute handler (async or sync)
      const result = sub.handler(data)
      if (result instanceof Promise) {
        promises.push(result.catch(error => {
          console.error(`[EventBus] Error in handler for ${eventType}:`, error)
        }))
      }
    }

    // Wait for all async handlers
    await Promise.all(promises)
  }

  /**
   * Get matching subscriptions for an event type
   * Supports wildcard matching (e.g., "market.*" matches "market.update")
   */
  private getMatchingSubscriptions(eventType: string): Subscription[] {
    const matching: Subscription[] = []

    for (const [subEventType, subs] of this.subscriptions.entries()) {
      if (this.matchesEventType(eventType, subEventType)) {
        matching.push(...subs)
      }
    }

    return matching
  }

  /**
   * Check if event type matches subscription pattern
   * Supports wildcards: "market.*" matches "market.update", "market.create", etc.
   */
  private matchesEventType(eventType: string, pattern: string): boolean {
    if (pattern === '*') {
      return true // Match all
    }

    if (!pattern.includes('*')) {
      return eventType === pattern // Exact match
    }

    // Wildcard matching
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
    const regex = new RegExp(`^${regexPattern}$`)

    return regex.test(eventType)
  }

  /**
   * Get recent event history
   *
   * @param eventType - Optional filter by event type
   * @param limit - Maximum number of events to return
   */
  getHistory(eventType?: string, limit: number = 100): AgentEvent[] {
    let events = this.eventHistory

    if (eventType) {
      events = events.filter(e => this.matchesEventType(e.type, eventType))
    }

    return events.slice(-limit)
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = []
  }

  /**
   * Get subscription count for event type
   */
  getSubscriptionCount(eventType?: string): number {
    if (!eventType) {
      return Array.from(this.subscriptions.values())
        .reduce((sum, subs) => sum + subs.length, 0)
    }

    const matchingSubs = this.getMatchingSubscriptions(eventType)
    return matchingSubs.length
  }

  /**
   * Remove all subscriptions
   */
  clear(): void {
    this.subscriptions.clear()
  }
}

// Singleton instance
let eventBusInstance: EventBus | null = null

/**
 * Get singleton EventBus instance
 */
export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus()
  }
  return eventBusInstance
}
