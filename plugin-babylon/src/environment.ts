/**
 * Babylon Prediction Markets Plugin - Environment Configuration
 *
 * Runtime settings and validation for the Babylon plugin
 */

import { z } from "zod";

/**
 * Environment variable schema
 */
export const babylonEnvSchema = z.object({
  // Agent Authentication (Required for trading)
  BABYLON_AGENT_ID: z.string().optional().default("babylon-agent-default"),
  BABYLON_AGENT_SECRET: z.string().optional(),

  // API Configuration
  BABYLON_API_URL: z.string().url().optional().default("http://localhost:3000"),

  // Trading Limits (Optional - can be set in character settings)
  BABYLON_MAX_TRADE_SIZE: z
    .string()
    .optional()
    .default("100")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),

  BABYLON_MAX_POSITION_SIZE: z
    .string()
    .optional()
    .default("500")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),

  BABYLON_MIN_CONFIDENCE: z
    .string()
    .optional()
    .default("0.6")
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(0).max(1)),

  // OpenAI Configuration (Required for agent)
  OPENAI_API_KEY: z.string().min(1),
});

export type BabylonEnvironment = z.infer<typeof babylonEnvSchema>;

/**
 * Validate environment variables
 */
export function validateBabylonEnvironment(
  env: Record<string, string | undefined>,
): {
  success: boolean;
  data?: BabylonEnvironment;
  error?: z.ZodError;
} {
  try {
    const validated = babylonEnvSchema.parse(env);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error };
    }
    throw error;
  }
}

/**
 * Get setting from runtime with fallback to environment
 */
export function getBabylonSetting(
  runtime: { getSetting?: (key: string) => string | undefined },
  key: keyof BabylonEnvironment,
  defaultValue?: string,
): string | undefined {
  // Try character secrets/settings first
  if (runtime.getSetting) {
    const value = runtime.getSetting(key);
    if (value) return value;
  }

  // Fall back to environment
  const envValue = process.env[key];
  if (envValue) return envValue;

  // Use default
  return defaultValue;
}

/**
 * Required environment variables for the plugin
 */
export const requiredEnvVars = ["OPENAI_API_KEY"] as const;

/**
 * Optional environment variables with descriptions
 */
export const optionalEnvVars = {
  BABYLON_AGENT_ID:
    "Agent identifier for authentication (default: babylon-agent-default)",
  BABYLON_AGENT_SECRET: "Secret key for agent authentication (enables trading)",
  BABYLON_API_URL: "API base URL (default: http://localhost:3000)",
  BABYLON_MAX_TRADE_SIZE: "Maximum trade size in USD (default: 100)",
  BABYLON_MAX_POSITION_SIZE:
    "Maximum total position size in USD (default: 500)",
  BABYLON_MIN_CONFIDENCE:
    "Minimum confidence threshold for trades (default: 0.6)",
} as const;
