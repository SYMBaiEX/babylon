/**
 * SSE (Server-Sent Events) module exports.
 *
 * This module provides a clean, encapsulated API for managing SSE connections.
 * The SSEManager singleton handles all connection logic, while the React hooks
 * provide convenient integration with React components.
 */

export {
  SSEManager,
  type Channel,
  type DynamicChannel,
  type StaticChannel,
  type SSEMessage,
  type SSECallback,
  type SSEManagerConfig,
  type ConnectionState,
  type ConnectionStateListener,
  type AuthTokenProvider,
} from './SSEManager';

