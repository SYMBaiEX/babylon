
import { describe, test } from 'bun:test';
import { prisma } from '@/lib/prisma';

describe('Prisma Check', () => {
  test('should check if prisma throws', () => {
    try {
      console.log('Prisma count:', prisma.user);
      // If we get here, prisma didn't throw on access
      console.log('Prisma did not throw');
    } catch (e) {
      if (e instanceof Error) {
        console.log('Prisma threw:', e.message);
      } else {
        console.log('Prisma threw:', String(e));
      }
    }
  });
});

