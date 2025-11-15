/**
 * Character Mapping Service Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { prisma } from '@/lib/prisma';
import { characterMappingService } from '@/lib/services/character-mapping-service';
import { generateSnowflakeId } from '@/lib/snowflake';

// Check if character mapping models are available
const mappingModelsAvailable = !!(prisma && prisma.characterMapping && prisma.organizationMapping);

describe('CharacterMappingService', () => {
  beforeEach(async () => {
    if (!mappingModelsAvailable) return;
    
    // Create test character mapping with unique names to avoid conflicts
    await prisma.characterMapping.create({
      data: {
        id: await generateSnowflakeId(),
        realName: 'Xenon Testington',
        parodyName: 'Neon Testifier',
        category: 'test',
        aliases: ['X. Testington', 'Testington'],
        priority: 100,
        isActive: true,
      },
    });

    // Create test org mapping with unique names
    await prisma.organizationMapping.create({
      data: {
        id: await generateSnowflakeId(),
        realName: 'TestCorp Industries',
        parodyName: 'FailCorp Disasters',
        category: 'test',
        aliases: ['TestCorp'],
        priority: 100,
        isActive: true,
      },
    });

    // Refresh cache
    characterMappingService.refreshCache();
  });

  afterEach(async () => {
    if (!prisma) return;
    // Ensure Prisma is initialized
    if (!prisma || !prisma.characterMapping || !prisma.organizationMapping) {
      console.warn('⚠️ Skipping cleanup - Prisma not initialized');
      return;
    }
    
    // Cleanup test data
    await prisma.characterMapping.deleteMany({
      where: {
        realName: { in: ['Xenon Testington'] },
      },
    });

    await prisma.organizationMapping.deleteMany({
      where: {
        realName: { in: ['TestCorp Industries'] },
      },
    });

    characterMappingService.refreshCache();
  });

  test('should transform character names in text', async () => {
    if (!mappingModelsAvailable) return;
    const text = 'Xenon Testington announced a new product today.';
    const result = await characterMappingService.transformText(text);

    expect(result.transformedText).toContain('Neon Testifier');
    expect(result.transformedText).not.toContain('Xenon Testington');
    expect(result.characterMappings['Xenon Testington']).toBe('Neon Testifier');
    expect(result.replacementCount).toBeGreaterThan(0);
  });

  test('should transform organization names in text', async () => {
    if (!mappingModelsAvailable) return;
    const text = 'TestCorp Industries released a new model.';
    const result = await characterMappingService.transformText(text);

    expect(result.transformedText).toContain('FailCorp Disasters');
    expect(result.transformedText).not.toContain('TestCorp Industries');
    expect(result.organizationMappings['TestCorp Industries']).toBe('FailCorp Disasters');
  });

  test('should handle case-insensitive matching', async () => {
    if (!mappingModelsAvailable) return;
    const text = 'xenon testington and XENON TESTINGTON are the same person.';
    const result = await characterMappingService.transformText(text);

    expect(result.transformedText.toLowerCase()).toContain('neon testifier');
    expect(result.replacementCount).toBeGreaterThan(0);
  });

  test('should handle aliases', async () => {
    if (!mappingModelsAvailable) return;
    const text = 'X. Testington made an announcement.';
    const result = await characterMappingService.transformText(text);

    expect(result.transformedText).toContain('Neon Testifier');
    expect(result.replacementCount).toBeGreaterThan(0);
  });

  test('should detect real names in text', async () => {
    if (!mappingModelsAvailable) return;
    const text = 'Xenon Testington and TestCorp Industries are mentioned here.';
    const detected = await characterMappingService.detectRealNames(text);

    expect(detected).toContain('Xenon Testington');
    expect(detected).toContain('TestCorp Industries');
  });

  test('should return empty array when no real names detected', async () => {
    if (!mappingModelsAvailable) return;
    const text = 'This text has no real names.';
    const detected = await characterMappingService.detectRealNames(text);

    expect(detected).toHaveLength(0);
  });

  test('should get all character mappings', async () => {
    if (!mappingModelsAvailable) return;
    const mappings = await characterMappingService.getCharacterMappings();

    expect(mappings).toBeDefined();
    expect(Array.isArray(mappings)).toBe(true);
    expect(mappings.some(m => m.realName === 'Xenon Testington')).toBe(true);
  });

  test('should get all organization mappings', async () => {
    if (!mappingModelsAvailable) return;
    const mappings = await characterMappingService.getOrganizationMappings();

    expect(mappings).toBeDefined();
    expect(Array.isArray(mappings)).toBe(true);
    expect(mappings.some(m => m.realName === 'TestCorp Industries')).toBe(true);
  });
});

