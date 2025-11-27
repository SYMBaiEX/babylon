/**
 * Shared Logger Utility for @babylon/agents
 *
 * Production-ready logging with configurable levels
 */

import type { LogData } from './types';

/**
 * Log level type
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log entry structure
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: LogData;
  context?: string;
}

/**
 * Logger Class
 */
class Logger {
  private level: LogLevel;
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(level?: LogLevel) {
    if (level && this.levelPriority[level] !== undefined) {
      this.level = level;
    } else {
      const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
      if (envLevel && this.levelPriority[envLevel] !== undefined) {
        this.level = envLevel;
      } else {
        this.level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.level];
  }

  private formatLog(entry: LogEntry): string {
    const contextStr = entry.context ? `[${entry.context}]` : '';
    let dataStr = '';
    if (entry.data) {
      try {
        const seen = new Set<unknown>();
        const replacer = (_key: string, value: unknown): unknown => {
          if (value instanceof Error) {
            return {
              name: value.name,
              message: value.message,
              stack: value.stack,
            };
          }
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          return value;
        };
        dataStr = ` ${JSON.stringify(entry.data, replacer)}`;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        dataStr = ` [SerializationError: ${errorMessage}]`;
      }
    }
    return `[${entry.timestamp}] ${contextStr} [${entry.level.toUpperCase()}] ${entry.message}${dataStr}`;
  }

  private log(
    level: LogLevel,
    message: string,
    data?: LogData,
    context?: string
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      context,
    };

    const formatted = this.formatLog(entry);

    switch (level) {
      case 'debug':
      case 'info':
        console.log(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, data?: LogData, context?: string): void {
    this.log('debug', message, data, context);
  }

  info(message: string, data?: LogData, context?: string): void {
    this.log('info', message, data, context);
  }

  warn(message: string, data?: LogData, context?: string): void {
    this.log('warn', message, data, context);
  }

  error(message: string, data?: LogData, context?: string): void {
    this.log('error', message, data, context);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();

export { Logger };

