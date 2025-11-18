
import { describe, test } from 'bun:test';

describe('Env Check', () => {
  test('should print DATABASE_URL', () => {
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
  });
});

