/**
 * Format Utilities Unit Tests
 * Tests for formatting dates, numbers, and other values
 */

import { describe, expect, it } from 'bun:test';
import {
  clamp,
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatPercentage,
  formatRelativeTime,
  formatTime,
  sanitizeId,
} from '@babylon/shared';

describe('Format Utilities', () => {
  describe('clamp', () => {
    it('should clamp values below minimum', () => {
      expect(clamp(-10, 0, 100)).toBe(0);
      expect(clamp(-100, -50, 50)).toBe(-50);
    });

    it('should clamp values above maximum', () => {
      expect(clamp(150, 0, 100)).toBe(100);
      expect(clamp(200, -50, 50)).toBe(50);
    });

    it('should not change values within range', () => {
      expect(clamp(50, 0, 100)).toBe(50);
      expect(clamp(0, -10, 10)).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(clamp(0, 0, 0)).toBe(0);
      expect(clamp(5, 5, 5)).toBe(5);
    });
  });

  describe('formatDate', () => {
    it('should format Date objects', () => {
      const date = new Date('2025-01-15');
      const formatted = formatDate(date);
      expect(formatted).toMatch(/Jan.*15.*2025/);
    });

    it('should format ISO strings', () => {
      const formatted = formatDate('2025-12-25T00:00:00Z');
      expect(formatted).toMatch(/Dec.*25.*2025/);
    });
  });

  describe('formatTime', () => {
    it('should format time from Date objects', () => {
      const date = new Date('2025-01-15T14:30:00');
      const formatted = formatTime(date);
      expect(formatted).toMatch(/2:30\s*PM/i);
    });

    it('should format time from ISO strings', () => {
      const formatted = formatTime('2025-01-15T09:15:00');
      expect(formatted).toMatch(/9:15\s*AM/i);
    });
  });

  describe('formatRelativeTime', () => {
    it('should format recent times in seconds', () => {
      const recentDate = new Date(Date.now() - 30000); // 30 seconds ago
      const formatted = formatRelativeTime(recentDate);
      expect(formatted).toMatch(/\d+s/);
    });

    it('should format times in minutes', () => {
      const minutesAgo = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const formatted = formatRelativeTime(minutesAgo);
      expect(formatted).toMatch(/\d+m/);
    });

    it('should format times in hours', () => {
      const hoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
      const formatted = formatRelativeTime(hoursAgo);
      expect(formatted).toMatch(/\d+h/);
    });

    it('should format times in days', () => {
      const daysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      const formatted = formatRelativeTime(daysAgo);
      expect(formatted).toMatch(/\d+d/);
    });

    it('should fall back to date format for old dates', () => {
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const formatted = formatRelativeTime(oldDate);
      expect(formatted).toMatch(/[A-Z][a-z]+.*\d+.*\d{4}/);
    });
  });

  describe('formatCompactNumber', () => {
    it('should format numbers less than 1000 as-is', () => {
      expect(formatCompactNumber(500)).toBe('500');
      expect(formatCompactNumber(0)).toBe('0');
      expect(formatCompactNumber(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
      expect(formatCompactNumber(1000)).toBe('1.0K');
      expect(formatCompactNumber(1500)).toBe('1.5K');
      expect(formatCompactNumber(999999)).toBe('1000.0K');
    });

    it('should format millions with M suffix', () => {
      expect(formatCompactNumber(1000000)).toBe('1.0M');
      expect(formatCompactNumber(2500000)).toBe('2.5M');
    });
  });

  describe('formatCurrency', () => {
    it('should format with default 2 decimal places', () => {
      expect(formatCurrency(123.456)).toBe('ƀ123.46');
      expect(formatCurrency(100)).toBe('ƀ100.00');
    });

    it('should format with custom decimal places', () => {
      expect(formatCurrency(123.456, 0)).toBe('ƀ123');
      expect(formatCurrency(123.456, 3)).toBe('ƀ123.456');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentages as integers', () => {
      expect(formatPercentage(50)).toBe('50%');
      expect(formatPercentage(12.3)).toBe('12%');
      expect(formatPercentage(99.9)).toBe('100%');
    });
  });

  describe('sanitizeId', () => {
    it('should convert to lowercase and remove special characters', () => {
      expect(sanitizeId('My User ID!')).toBe('my-user-id');
      expect(sanitizeId('Test@User#123')).toBe('testuser123');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeId(null)).toBe('unknown');
      expect(sanitizeId(undefined)).toBe('unknown');
    });

    it('should replace spaces with hyphens', () => {
      expect(sanitizeId('hello world')).toBe('hello-world');
      expect(sanitizeId('multiple   spaces')).toBe('multiple-spaces');
    });

    it('should preserve underscores', () => {
      expect(sanitizeId('user_123')).toBe('user_123');
    });
  });
});
