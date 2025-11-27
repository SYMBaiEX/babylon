/**
 * Simple logger for contracts package
 * Avoids circular dependency with @babylon/shared
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, message: string, ...args: unknown[]): void {
  const prefix = `[${level.toUpperCase()}]`;
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${prefix}`, message, ...args);
}

export const logger = {
  info: (message: string, ...args: unknown[]) => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => log('error', message, ...args),
  debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
};

