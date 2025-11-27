/**
 * Tests for Asset URL utilities
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  isAbsoluteUrl,
  getStaticAssetUrl,
  getFallbackProfileImageUrl,
  getProfileImageUrl,
  getOrganizationImageUrl,
  getBannerImageUrl,
} from '@babylon/shared/utils/assets';

describe('Asset URL Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_STATIC_ASSETS_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isAbsoluteUrl', () => {
    it('should return true for https URLs', () => {
      expect(isAbsoluteUrl('https://example.com/image.jpg')).toBe(true);
      expect(isAbsoluteUrl('HTTPS://example.com/image.jpg')).toBe(true);
    });

    it('should return true for http URLs', () => {
      expect(isAbsoluteUrl('http://example.com/image.jpg')).toBe(true);
      expect(isAbsoluteUrl('HTTP://example.com/image.jpg')).toBe(true);
    });

    it('should return true for data URLs', () => {
      expect(isAbsoluteUrl('data:image/png;base64,abc123')).toBe(true);
      expect(isAbsoluteUrl('DATA:image/jpeg;base64,xyz')).toBe(true);
    });

    it('should return true for blob URLs', () => {
      expect(isAbsoluteUrl('blob:http://localhost:3000/abc-123')).toBe(true);
      expect(isAbsoluteUrl('BLOB:http://example.com/xyz')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(isAbsoluteUrl('/images/profile.jpg')).toBe(false);
      expect(isAbsoluteUrl('images/profile.jpg')).toBe(false);
      expect(isAbsoluteUrl('./assets/logo.png')).toBe(false);
    });
  });

  describe('getStaticAssetUrl', () => {
    it('should return absolute URLs unchanged', () => {
      const cdnUrl = 'https://cdn.example.com/image.jpg';
      expect(getStaticAssetUrl(cdnUrl)).toBe(cdnUrl);
    });

    it('should return data URLs unchanged', () => {
      const dataUrl = 'data:image/png;base64,abc123';
      expect(getStaticAssetUrl(dataUrl)).toBe(dataUrl);
    });

    it('should prepend slash to path without slash', () => {
      expect(getStaticAssetUrl('images/profile.jpg')).toBe('/images/profile.jpg');
    });

    it('should keep slash for path with slash', () => {
      expect(getStaticAssetUrl('/images/profile.jpg')).toBe('/images/profile.jpg');
    });

    it('should use provided CDN base URL', () => {
      const result = getStaticAssetUrl('/images/profile.jpg', 'https://cdn.example.com');
      expect(result).toBe('https://cdn.example.com/images/profile.jpg');
    });

    it('should use environment variable CDN URL', () => {
      process.env.NEXT_PUBLIC_STATIC_ASSETS_URL = 'https://assets.babylon.com';
      const result = getStaticAssetUrl('/images/profile.jpg');
      expect(result).toBe('https://assets.babylon.com/images/profile.jpg');
    });

    it('should prefer provided CDN URL over environment variable', () => {
      process.env.NEXT_PUBLIC_STATIC_ASSETS_URL = 'https://env.cdn.com';
      const result = getStaticAssetUrl('/images/profile.jpg', 'https://provided.cdn.com');
      expect(result).toBe('https://provided.cdn.com/images/profile.jpg');
    });
  });

  describe('getFallbackProfileImageUrl', () => {
    it('should generate deterministic fallback URL based on ID', () => {
      const url1 = getFallbackProfileImageUrl('user123');
      const url2 = getFallbackProfileImageUrl('user123');
      expect(url1).toBe(url2);
    });

    it('should generate different URLs for different IDs', () => {
      const url1 = getFallbackProfileImageUrl('user123');
      const url2 = getFallbackProfileImageUrl('user456');
      expect(url1).not.toBe(url2);
    });

    it('should generate profile number between 1 and 100', () => {
      const url = getFallbackProfileImageUrl('test-id');
      const match = url.match(/profile-(\d+)\.jpg$/);
      expect(match).toBeTruthy();
      const captured = match?.[1];
      if (!captured) throw new Error('Expected capture group to be defined');
      const profileNum = parseInt(captured, 10);
      expect(profileNum).toBeGreaterThanOrEqual(1);
      expect(profileNum).toBeLessThanOrEqual(100);
    });

    it('should use CDN URL when provided', () => {
      const url = getFallbackProfileImageUrl('user123', 'https://cdn.example.com');
      expect(url.startsWith('https://cdn.example.com')).toBe(true);
    });
  });

  describe('getProfileImageUrl', () => {
    it('should return profile image URL when provided', () => {
      const result = getProfileImageUrl('https://cdn.example.com/image.jpg', 'user123');
      expect(result).toBe('https://cdn.example.com/image.jpg');
    });

    it('should normalize relative profile image paths', () => {
      const result = getProfileImageUrl('/uploads/profile.jpg', 'user123', true, 'https://cdn.example.com');
      expect(result).toBe('https://cdn.example.com/uploads/profile.jpg');
    });

    it('should return actor image path when no profile image and isActor is true', () => {
      const result = getProfileImageUrl(null, 'actor123', true);
      expect(result).toBe('/images/actors/actor123.jpg');
    });

    it('should return null when no profile image and isActor is false', () => {
      const result = getProfileImageUrl(null, 'user123', false);
      expect(result).toBeNull();
    });

    it('should return null when no profile image and no userId', () => {
      const result = getProfileImageUrl(null, null, true);
      expect(result).toBeNull();
    });

    it('should use CDN for actor images when provided', () => {
      const result = getProfileImageUrl(null, 'actor123', true, 'https://cdn.example.com');
      expect(result).toBe('https://cdn.example.com/images/actors/actor123.jpg');
    });
  });

  describe('getOrganizationImageUrl', () => {
    it('should return image URL when provided', () => {
      const result = getOrganizationImageUrl('https://cdn.example.com/org.jpg', 'org123');
      expect(result).toBe('https://cdn.example.com/org.jpg');
    });

    it('should normalize relative image paths', () => {
      const result = getOrganizationImageUrl('/uploads/org.jpg', 'org123', 'https://cdn.example.com');
      expect(result).toBe('https://cdn.example.com/uploads/org.jpg');
    });

    it('should return organization image path when no image URL', () => {
      const result = getOrganizationImageUrl(null, 'org123');
      expect(result).toBe('/images/organizations/org123.jpg');
    });

    it('should return null when no image URL and no orgId', () => {
      const result = getOrganizationImageUrl(null, null);
      expect(result).toBeNull();
    });
  });

  describe('getBannerImageUrl', () => {
    it('should return banner URL when provided', () => {
      const result = getBannerImageUrl('https://cdn.example.com/banner.jpg', 'entity123');
      expect(result).toBe('https://cdn.example.com/banner.jpg');
    });

    it('should normalize relative banner paths', () => {
      const result = getBannerImageUrl('/uploads/banner.jpg', 'entity123', 'actor', 'https://cdn.example.com');
      expect(result).toBe('https://cdn.example.com/uploads/banner.jpg');
    });

    it('should return actor banner path for actor entity type', () => {
      const result = getBannerImageUrl(null, 'actor123', 'actor');
      expect(result).toBe('/images/actor-banners/actor123.jpg');
    });

    it('should return organization banner path for organization entity type', () => {
      const result = getBannerImageUrl(null, 'org123', 'organization');
      expect(result).toBe('/images/org-banners/org123.jpg');
    });

    it('should return null for user entity type with no banner', () => {
      const result = getBannerImageUrl(null, 'user123', 'user');
      expect(result).toBeNull();
    });

    it('should return null when no banner and no entityId', () => {
      const result = getBannerImageUrl(null, null, 'actor');
      expect(result).toBeNull();
    });
  });
});

