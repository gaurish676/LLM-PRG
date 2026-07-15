export interface ParsedArgs {
  command: string;
  args: string[];
  options: Record<string, string | boolean>;
}

/**
 * High-performance, zero-dependency command line argument parser.
 * Space Complexity: O(N) relative to arguments count.
 * Time Complexity: O(N) single-pass iteration.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const rawArgs = argv.slice(2);
  if (rawArgs.length === 0) {
    return { command: 'help', args: [], options: {} };
  }

  const command = rawArgs[0];
  const args: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (arg.startsWith('--')) {
      const parts = arg.slice(2).split('=');
      const key = parts[0];
      if (parts.length > 1) {
        options[key] = parts[1];
      } else {
        const next = rawArgs[i + 1];
        if (next && !next.startsWith('-')) {
          options[key] = next;
          i++; // Skip next token as it's the option value
        } else {
          options[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const chars = arg.slice(1);
      for (const char of chars) {
        options[char] = true;
      }
    } else {
      args.push(arg);
    }
  }

  return { command, args, options };
}
