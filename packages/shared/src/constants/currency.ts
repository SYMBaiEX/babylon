/**
 * Currency constants for Babylon points system
 *
 * Babylon uses a custom points currency system represented by ₿ (strikethrough B)
 * NOT to be confused with USD ($) or Bitcoin (₿ without strikethrough)
 */

/**
 * Symbol used for displaying Babylon points in the UI
 * Uses the Unicode character ₿ (U+20BF) - Bitcoin sign
 *
 * Note: The actual Babylon symbol has a strikethrough, but ₿ is used
 * as the closest Unicode representation for text contexts
 */
export const BABYLON_POINTS_SYMBOL = '₿';

/**
 * Abbreviated text representation for Babylon points
 * Used in labels, form fields, and contexts where the symbol may not render properly
 */
export const BABYLON_POINTS_ABBREV = 'PTS';

/**
 * Full name for the currency
 */
export const BABYLON_POINTS_NAME = 'Babylon Points';
