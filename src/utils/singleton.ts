/**
 * Singleton Utility Patterns
 * 
 * @module utils/singleton
 * 
 * @description
 * Reusable singleton patterns for managing server-side instance lifecycles.
 * Provides three flavors of singleton management:
 * - Standard singleton (module-scoped)
 * - Global singleton (survives hot module reload in development)
 * - Port-aware singleton (prevents port binding conflicts for WebSocket servers)
 * 
 * **Use Cases:**
 * - Database connection pools
 * - WebSocket servers
 * - Cache instances
 * - API clients with expensive initialization
 * - Development hot-reload-safe singletons
 * 
 * @example
 * ```typescript
 * // Standard singleton
 * const { getInstance, setInstance } = createSingleton<Database>()
 * if (!getInstance()) {
 *   setInstance(new Database())
 * }
 * 
 * // Global singleton (hot-reload safe)
 * const dbSingleton = createGlobalSingleton<Database>('database')
 * if (!dbSingleton.getInstance()) {
 *   dbSingleton.setInstance(new Database())
 * }
 * 
 * // Port-aware singleton
 * const wsSingleton = createPortSingleton<WebSocketServer>('wss')
 * const existing = wsSingleton.getInstance(3000)
 * if (!existing) {
 *   wsSingleton.setInstance(new WebSocketServer(), 3000)
 * }
 * ```
 */

/**
 * Type for the global object used for singleton storage
 * @internal
 */
interface GlobalSingletonStorage {
  [key: string]: unknown;
}

/**
 * Helper to get typed global object
 * @internal
 */
function getGlobalStorage(): GlobalSingletonStorage {
  return global as unknown as GlobalSingletonStorage;
}

/**
 * Creates a module-scoped singleton pattern
 * 
 * @template T - Type of the singleton instance
 * @returns Singleton management object with get/set/clear methods
 * 
 * @description
 * Creates a singleton that persists for the lifetime of the module.
 * Gets reset when module is hot-reloaded in development.
 * 
 * @example
 * ```typescript
 * const cacheSingleton = createSingleton<Cache>()
 * if (!cacheSingleton.getInstance()) {
 *   cacheSingleton.setInstance(new Cache())
 * }
 * const cache = cacheSingleton.getInstance()
 * ```
 */
export function createSingleton<T>(): {
  getInstance: () => T | null;
  setInstance: (instance: T) => void;
  clearInstance: () => void;
} {
  let instance: T | null = null;

  return {
    getInstance: () => instance,
    setInstance: (inst: T) => {
      instance = inst;
    },
    clearInstance: () => {
      instance = null;
    },
  };
}

/**
 * Creates a global singleton that survives hot module reloads
 * Uses Node.js global object to persist across module reloads
 */
export function createGlobalSingleton<T>(
  globalKey: string
): {
  getInstance: () => T | null;
  setInstance: (instance: T) => void;
  clearInstance: () => void;
} {
  const globalObj = getGlobalStorage();

  return {
    getInstance: () => {
      const value = globalObj[globalKey];
      return (value as T | undefined) || null;
    },
    setInstance: (instance: T) => {
      globalObj[globalKey] = instance;
    },
    clearInstance: () => {
      globalObj[globalKey] = undefined;
    },
  };
}

/**
 * Creates a port-aware singleton for WebSocket servers
 * Prevents multiple servers from binding to the same port
 */
export function createPortSingleton<T>(
  globalKey: string,
  portKey: string = `${globalKey}Port`
): {
  getInstance: (port?: number) => T | null;
  setInstance: (instance: T, port?: number) => void;
  clearInstance: () => void;
} {
  const globalObj = getGlobalStorage();

  return {
    getInstance: (port?: number) => {
      const existing = globalObj[globalKey] as T | undefined;
      const existingPort = globalObj[portKey] as number | undefined;
      
      // If port is specified, only return if it matches
      if (port !== undefined && existingPort !== port) {
        return null;
      }
      
      return existing || null;
    },
    setInstance: (instance: T, port?: number) => {
      globalObj[globalKey] = instance;
      if (port !== undefined) {
        globalObj[portKey] = port;
      }
    },
    clearInstance: () => {
      globalObj[globalKey] = undefined;
      globalObj[portKey] = undefined;
    },
  };
}

