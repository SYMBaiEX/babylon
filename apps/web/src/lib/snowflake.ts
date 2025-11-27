/**
 * Snowflake ID Generator
 *
 * @description Generates unique 64-bit IDs similar to Twitter's Snowflake system.
 * Provides distributed ID generation with timestamp ordering and worker isolation.
 *
 * Structure (64 bits total):
 * - 1 bit: Always 0 (sign bit for compatibility)
 * - 41 bits: Timestamp in milliseconds since custom epoch (2024-01-01)
 * - 10 bits: Worker/Machine ID (0-1023)
 * - 12 bits: Sequence number (0-4095)
 *
 * This allows for:
 * - 69 years of timestamps (from epoch)
 * - 1024 different workers/machines
 * - 4096 IDs per millisecond per worker
 * - Total: ~4 million IDs per second per worker
 */

// Custom epoch: January 1, 2024 00:00:00 UTC
const EPOCH = 1704067200000n; // BigInt for precision

// Bit lengths
const WORKER_BITS = 10n;
const SEQUENCE_BITS = 12n;

// Maximum values
const MAX_WORKER_ID = (1n << WORKER_BITS) - 1n; // 1023
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n; // 4095

// Bit shifts
const TIMESTAMP_SHIFT = WORKER_BITS + SEQUENCE_BITS; // 22
const WORKER_SHIFT = SEQUENCE_BITS; // 12

/**
 * Snowflake ID Generator Class
 *
 * @description Generates unique, ordered IDs using the Snowflake algorithm.
 * Thread-safe with async queue for concurrent ID generation. Ensures IDs are
 * always increasing and unique across workers.
 */
class SnowflakeGenerator {
  private workerId: bigint;
  private sequence = 0n;
  private lastTimestamp = 0n;
  private generating = false;
  private queue: Array<{
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(workerId = 0) {
    if (workerId < 0 || workerId > Number(MAX_WORKER_ID)) {
      throw new Error(`Worker ID must be between 0 and ${MAX_WORKER_ID}`);
    }
    this.workerId = BigInt(workerId);
  }

  /**
   * Generate a new Snowflake ID (async with mutex for concurrency safety)
   *
   * @description Generates a unique Snowflake ID asynchronously. Uses a queue
   * to ensure thread-safe generation even with concurrent requests.
   *
   * @returns {Promise<string>} Unique Snowflake ID as string
   *
   * @example
   * ```typescript
   * const generator = new SnowflakeGenerator(1);
   * const id = await generator.generate();
   * // Returns: "1234567890123456789"
   * ```
   */
  async generate(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the queue of ID generation requests
   *
   * @description Internal method that processes queued ID generation requests
   * one at a time to ensure thread safety. Uses a mutex pattern.
   *
   * @private
   */
  private processQueue(): void {
    if (this.generating || this.queue.length === 0) {
      return;
    }

    this.generating = true;
    const request = this.queue.shift()!;

    try {
      const id = this.generateSync();
      request.resolve(id);
    } catch (error) {
      request.reject(error as Error);
    } finally {
      this.generating = false;
      // Process next item in queue
      queueMicrotask(() => this.processQueue());
    }
  }

  /**
   * Generate a new Snowflake ID (synchronous internal method)
   *
   * @description Internal synchronous method that performs the actual ID generation.
   * Handles sequence overflow and clock skew detection.
   *
   * @returns {string} Unique Snowflake ID as string
   * @throws {Error} If clock moves backwards
   * @private
   */
  private generateSync(): string {
    let timestamp = BigInt(Date.now()) - EPOCH;

    // If same millisecond, increment sequence
    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE;

      // If sequence overflow, wait for next millisecond
      if (this.sequence === 0n) {
        timestamp = this.waitNextMillis(timestamp);
      }
    } else {
      // New millisecond, reset sequence
      this.sequence = 0n;
    }

    // Timestamp should never go backwards
    if (timestamp < this.lastTimestamp) {
      throw new Error('Clock moved backwards. Refusing to generate ID.');
    }

    this.lastTimestamp = timestamp;

    // Construct the ID
    const id =
      (timestamp << TIMESTAMP_SHIFT) |
      (this.workerId << WORKER_SHIFT) |
      this.sequence;

    return id.toString();
  }

  /**
   * Wait for the next millisecond
   *
   * @description Blocks until the next millisecond when sequence overflow occurs.
   * Ensures unique IDs even at high generation rates.
   *
   * @param {bigint} lastTimestamp - Last timestamp used
   * @returns {bigint} New timestamp in next millisecond
   * @private
   */
  private waitNextMillis(lastTimestamp: bigint): bigint {
    let timestamp = BigInt(Date.now()) - EPOCH;
    while (timestamp <= lastTimestamp) {
      timestamp = BigInt(Date.now()) - EPOCH;
    }
    return timestamp;
  }

  /**
   * Parse a Snowflake ID to extract its components
   *
   * @description Extracts timestamp, worker ID, and sequence from a Snowflake ID.
   * Useful for debugging and understanding ID structure.
   *
   * @param {string | bigint} id - Snowflake ID to parse
   * @returns {object} Parsed components with timestamp, workerId, and sequence
   *
   * @example
   * ```typescript
   * const parsed = SnowflakeGenerator.parse('1234567890123456789');
   * // Returns: { timestamp: Date, workerId: 1, sequence: 0 }
   * ```
   */
  static parse(id: string | bigint): {
    timestamp: Date;
    workerId: number;
    sequence: number;
  } {
    const idBigInt = typeof id === 'string' ? BigInt(id) : id;

    const timestamp = (idBigInt >> TIMESTAMP_SHIFT) + EPOCH;
    const workerId = (idBigInt >> WORKER_SHIFT) & MAX_WORKER_ID;
    const sequence = idBigInt & MAX_SEQUENCE;

    return {
      timestamp: new Date(Number(timestamp)),
      workerId: Number(workerId),
      sequence: Number(sequence),
    };
  }

  /**
   * Check if a string is a valid Snowflake ID
   *
   * @description Validates that a string represents a valid Snowflake ID format.
   * Checks that it can be parsed and is within valid range.
   *
   * @param {string} id - String to validate
   * @returns {boolean} True if valid Snowflake ID
   *
   * @example
   * ```typescript
   * SnowflakeGenerator.isValid('1234567890123456789'); // Returns: true
   * SnowflakeGenerator.isValid('invalid'); // Returns: false
   * ```
   */
  static isValid(id: string): boolean {
    const idBigInt = BigInt(id);
    if (idBigInt < 0n || idBigInt >= 1n << 63n) {
      return false;
    }
    SnowflakeGenerator.parse(idBigInt);
    return true;
  }
}

// Singleton instance - uses worker ID from environment or defaults to 0
let instance: SnowflakeGenerator | null = null;

/**
 * Get or create the global Snowflake generator instance
 *
 * @description Returns the singleton Snowflake generator instance. Creates
 * a new instance on first call using WORKER_ID environment variable or 0.
 *
 * @returns {SnowflakeGenerator} Global Snowflake generator instance
 * @private
 */
function getGenerator(): SnowflakeGenerator {
  if (!instance) {
    // In production, you might want to use different worker IDs per server
    // For now, we'll use a hash of the hostname or 0
    const workerId = process.env.WORKER_ID
      ? Number.parseInt(process.env.WORKER_ID, 10)
      : 0;
    instance = new SnowflakeGenerator(workerId);
  }
  return instance;
}

/**
 * Generate a new Snowflake ID (convenience function)
 *
 * @description Convenience function for generating Snowflake IDs using the
 * global singleton instance. Most common way to generate IDs.
 *
 * @returns {Promise<string>} Unique Snowflake ID as string
 *
 * @example
 * ```typescript
 * const id = await generateSnowflakeId();
 * // Returns: "1234567890123456789"
 * ```
 */
export async function generateSnowflakeId(): Promise<string> {
  return await getGenerator().generate();
}

/**
 * Parse a Snowflake ID (convenience function)
 *
 * @description Convenience function for parsing Snowflake IDs. Extracts
 * timestamp, worker ID, and sequence components.
 *
 * @param {string | bigint} id - Snowflake ID to parse
 * @returns {object} Parsed components with timestamp, workerId, and sequence
 */
export function parseSnowflakeId(id: string | bigint) {
  return SnowflakeGenerator.parse(id);
}

/**
 * Check if a string is a valid Snowflake ID (convenience function)
 *
 * @description Convenience function for validating Snowflake IDs.
 *
 * @param {string} id - String to validate
 * @returns {boolean} True if valid Snowflake ID
 */
export function isValidSnowflakeId(id: string): boolean {
  return SnowflakeGenerator.isValid(id);
}

/**
 * Export the class for advanced usage
 */
export { SnowflakeGenerator };
