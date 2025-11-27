/**
 * Simple argument parsing utilities
 */

export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, boolean>;
  options: Record<string, string>;
}

/**
 * Parse command-line arguments into structured format
 *
 * @example
 * parseArgs(['grant', 'alice', '--verbose', '--count=5'])
 * // { command: 'grant', positional: ['alice'], flags: { verbose: true }, options: { count: '5' } }
 */
export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: '',
    positional: [],
    flags: {},
    options: {},
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (key) {
        if (value !== undefined) {
          result.options[key] = value;
        } else {
          result.flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short flags like -v, -h
      const key = arg.slice(1);
      result.flags[key] = true;
    } else if (!result.command) {
      result.command = arg;
    } else {
      result.positional.push(arg);
    }
  }

  return result;
}

/**
 * Check if help flag is present
 */
export function wantsHelp(args: ParsedArgs): boolean {
  return args.flags['help'] === true || args.flags['h'] === true || args.command === 'help';
}

/**
 * Get option value with fallback
 */
export function getOption(
  args: ParsedArgs,
  long: string,
  short?: string
): string | undefined {
  return args.options[long] ?? (short ? args.options[short] : undefined);
}

/**
 * Get flag value
 */
export function getFlag(args: ParsedArgs, long: string, short?: string): boolean {
  return args.flags[long] === true || (short ? args.flags[short] === true : false);
}
