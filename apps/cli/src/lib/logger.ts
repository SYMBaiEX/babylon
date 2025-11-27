/**
 * Simple CLI logger
 */

type LogData = string | string[] | Record<string, unknown> | Error;

export const logger = {
  info: (msg: string, data?: LogData): void => {
    if (data) {
      console.log(`[INFO] ${msg}`, data);
    } else {
      console.log(`[INFO] ${msg}`);
    }
  },

  error: (msg: string, data?: LogData): void => {
    if (data) {
      console.error(`[ERROR] ${msg}`, data);
    } else {
      console.error(`[ERROR] ${msg}`);
    }
  },

  warn: (msg: string, data?: LogData): void => {
    if (data) {
      console.warn(`[WARN] ${msg}`, data);
    } else {
      console.warn(`[WARN] ${msg}`);
    }
  },

  debug: (msg: string, data?: LogData): void => {
    if (process.env.DEBUG) {
      if (data) {
        console.log(`[DEBUG] ${msg}`, data);
      } else {
        console.log(`[DEBUG] ${msg}`);
      }
    }
  },

  success: (msg: string): void => {
    console.log(`✅ ${msg}`);
  },

  fail: (msg: string): void => {
    console.log(`❌ ${msg}`);
  },

  step: (msg: string): void => {
    console.log(`→ ${msg}`);
  },

  header: (title: string): void => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${'═'.repeat(60)}\n`);
  },
};


