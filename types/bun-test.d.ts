/// <reference types="bun-types" />

declare module 'bun:test' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toMatch(expected: string | RegExp): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toHaveLength(expected: number): void;
    toThrow(expected?: string | RegExp | Error): void;
    not: {
      toBe(expected: unknown): void;
      toEqual(expected: unknown): void;
      toContain(expected: unknown): void;
      toMatch(expected: string | RegExp): void;
      toBeTruthy(): void;
      toBeFalsy(): void;
      toBeDefined(): void;
      toBeUndefined(): void;
      toBeNull(): void;
      toHaveLength(expected: number): void;
    };
  };
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function mock(fn?: (...args: unknown[]) => unknown): {
    (...args: unknown[]): unknown;
    mock: {
      calls: unknown[][];
      results: unknown[];
    };
  };
  export function spyOn(obj: object, method: string): {
    mockReturnValue(value: unknown): void;
    mockResolvedValue(value: unknown): void;
    mockRejectedValue(value: unknown): void;
    mockRestore(): void;
    restore(): void;
  };
}
