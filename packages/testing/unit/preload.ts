/**
 * Preload file for unit tests
 *
 * This file is loaded before all unit tests to set up the test environment.
 * It mocks external dependencies like Redis connections.
 *
 * NOTE: Database (@babylon/db) is NOT mocked here - tests should mock it themselves
 * because the db module has many exports that tests need to control individually.
 */

import { mock } from 'bun:test';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.BUN_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock_test';
process.env.REDIS_URL = 'redis://localhost:6379';
// Mock API keys to prevent initialization errors
process.env.GROQ_API_KEY = 'mock-groq-api-key-for-testing';
process.env.OPENAI_API_KEY = 'mock-openai-api-key-for-testing';

// Mock Redis/ioredis
mock.module('ioredis', () => {
  return {
    default: class MockRedis {
      constructor() {}
      on() {
        return this;
      }
      once() {
        return this;
      }
      removeListener() {
        return this;
      }
      removeAllListeners() {
        return this;
      }
      connect() {
        return Promise.resolve();
      }
      disconnect() {
        return Promise.resolve();
      }
      quit() {
        return Promise.resolve('OK');
      }
      get() {
        return Promise.resolve(null);
      }
      set() {
        return Promise.resolve('OK');
      }
      setex() {
        return Promise.resolve('OK');
      }
      del() {
        return Promise.resolve(1);
      }
      exists() {
        return Promise.resolve(0);
      }
      expire() {
        return Promise.resolve(1);
      }
      ttl() {
        return Promise.resolve(-1);
      }
      keys() {
        return Promise.resolve([]);
      }
      flushall() {
        return Promise.resolve('OK');
      }
      hget() {
        return Promise.resolve(null);
      }
      hset() {
        return Promise.resolve(1);
      }
      hdel() {
        return Promise.resolve(1);
      }
      hgetall() {
        return Promise.resolve({});
      }
      sadd() {
        return Promise.resolve(1);
      }
      srem() {
        return Promise.resolve(1);
      }
      smembers() {
        return Promise.resolve([]);
      }
      sismember() {
        return Promise.resolve(0);
      }
      zadd() {
        return Promise.resolve(1);
      }
      zrem() {
        return Promise.resolve(1);
      }
      zrange() {
        return Promise.resolve([]);
      }
      zrevrange() {
        return Promise.resolve([]);
      }
      pipeline() {
        const pipeline = {
          commands: [] as unknown[],
          get(key: string) {
            this.commands.push(['get', key]);
            return this;
          },
          set(key: string, value: unknown) {
            this.commands.push(['set', key, value]);
            return this;
          },
          del(key: string) {
            this.commands.push(['del', key]);
            return this;
          },
          exec() {
            return Promise.resolve(this.commands.map(() => [null, 'OK']));
          },
        };
        return pipeline;
      }
    },
  };
});

// Note: Logger is NOT mocked - it's a simple console wrapper with no side effects
// Keeping real logger helps debug failing tests

// Note: @babylon/db is NOT mocked here - individual tests should mock it as needed
// This is because:
// 1. The db module has many named exports (tables, operators) that tests need
// 2. Tests may need to control mock return values differently
// 3. Mocking everything globally makes it hard to test specific behaviors

console.log('Unit test environment initialized (Redis mocked, DB not mocked)');
