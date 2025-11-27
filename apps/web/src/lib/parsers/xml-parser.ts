/**
 * XML Response Parser
 *
 * @description
 * Canonical parser for handling all XML response formats from LLMs.
 * Consolidates 10+ duplicated parsing implementations into one.
 *
 * **Handles All Formats**:
 * - Direct array: { items: [...] }
 * - XML nested: { items: { item: [...] } }
 * - Response wrapped: { response: { items: [...] } }
 * - Single item: { items: { item: {...} } }
 * - Array of objects: [{ items: [...] }, { items: [...] }]
 *
 * **Usage**:
 * ```typescript
 * const questions = XMLParser.extractArray<Question>(rawResult, 'questions', 'question');
 * const scenarios = XMLParser.extractArray<Scenario>(rawResult, 'scenarios', 'scenario');
 * const events = XMLParser.extractArray<Event>(rawResult, 'events', 'event');
 * ```
 */

import { logger } from '@/lib/logger';

export class XMLParser {
  /**
   * Extract array from XML/JSON response with all format handling
   *
   * @param response - Raw LLM response
   * @param arrayField - Field name for array (e.g., 'questions', 'scenarios')
   * @param itemField - Field name for items in XML nesting (e.g., 'question', 'scenario')
   * @returns Extracted and flattened array
   *
   * @example
   * ```typescript
   * // Handles: { questions: [...] }
   * // Handles: { questions: { question: [...] } }
   * // Handles: { response: { questions: [...] } }
   * // Handles: [{ questions: [...] }, ...]
   * const questions = XMLParser.extractArray<Question>(rawResult, 'questions', 'question');
   * ```
   */
  static extractArray<T>(
    response: unknown,
    arrayField: string,
    itemField?: string
  ): T[] {
    // Handle null/undefined
    if (!response) {
      logger.warn(
        'XMLParser received null/undefined response',
        {},
        'XMLParser'
      );
      return [];
    }

    // Handle array of objects format: [{ items: [...] }, { items: [...] }]
    if (Array.isArray(response)) {
      logger.info(
        'XMLParser: Flattening array format',
        { arrayField },
        'XMLParser'
      );
      return response.flatMap((item) => {
        if (item && typeof item === 'object' && arrayField in item) {
          const value = (item as Record<string, unknown>)[arrayField];
          if (Array.isArray(value)) {
            return value as T[];
          }
        }
        return [];
      });
    }

    // Not an object - invalid
    if (typeof response !== 'object') {
      logger.error(
        'XMLParser: Response is not an object',
        { type: typeof response },
        'XMLParser'
      );
      return [];
    }

    const obj = response as Record<string, unknown>;

    // Handle response wrapper: { response: { items: [...] } }
    if ('response' in obj && obj.response && typeof obj.response === 'object') {
      logger.info(
        'XMLParser: Extracting from response wrapper',
        { arrayField },
        'XMLParser'
      );
      return XMLParser.extractArray(obj.response, arrayField, itemField);
    }

    // Check if array field exists
    if (!(arrayField in obj)) {
      logger.warn(
        'XMLParser: Field not found in response',
        {
          arrayField,
          availableFields: Object.keys(obj),
        },
        'XMLParser'
      );
      return [];
    }

    const fieldValue = obj[arrayField];

    // Direct array: { items: [...] }
    if (Array.isArray(fieldValue)) {
      return fieldValue as T[];
    }

    // XML nested structure: { items: { item: [...] } }
    if (
      itemField &&
      fieldValue &&
      typeof fieldValue === 'object' &&
      itemField in fieldValue
    ) {
      logger.info(
        'XMLParser: Extracting from nested structure',
        {
          arrayField,
          itemField,
        },
        'XMLParser'
      );

      const nested = (fieldValue as Record<string, unknown>)[itemField];

      // Could be array or single item
      if (Array.isArray(nested)) {
        return nested as T[];
      }
      if (nested) {
        return [nested] as T[];
      }
    }

    // Unknown format
    logger.warn(
      'XMLParser: Unknown format',
      {
        arrayField,
        itemField,
        fieldType: typeof fieldValue,
        fieldKeys:
          fieldValue && typeof fieldValue === 'object'
            ? Object.keys(fieldValue)
            : [],
      },
      'XMLParser'
    );

    return [];
  }

  /**
   * Extract single object from response
   *
   * @param response - Raw LLM response
   * @param objectField - Field name for object
   * @returns Extracted object or null
   */
  static extractObject<T>(response: unknown, objectField: string): T | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    const obj = response as Record<string, unknown>;

    // Handle response wrapper
    if ('response' in obj && obj.response) {
      return XMLParser.extractObject(obj.response, objectField);
    }

    // Direct access
    if (objectField in obj) {
      return obj[objectField] as T;
    }

    return null;
  }

  /**
   * Validate extracted data is not empty
   *
   * @param data - Extracted data
   * @param context - Context for error message
   * @throws Error if data is empty
   */
  static validateNotEmpty<T>(data: T[], context: string): void {
    if (!data || data.length === 0) {
      throw new Error(`XMLParser: No valid data extracted for ${context}`);
    }
  }
}
