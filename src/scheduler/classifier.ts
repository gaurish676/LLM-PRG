export enum TaskIntent {
  RENAME_SYMBOL = 'RENAME_SYMBOL',
  MOVE_FILE = 'MOVE_FILE',
  CREATE_FILE = 'CREATE_FILE',
  DELETE_FILE = 'DELETE_FILE',
  FORMAT_CODE = 'FORMAT_CODE',
  RUN_BUILD = 'RUN_BUILD',
  RUN_TEST = 'RUN_TEST',
  RUN_LINT = 'RUN_LINT',
  GIT_STATUS = 'GIT_STATUS',
  GIT_DIFF = 'GIT_DIFF',
  COPY_FILES = 'COPY_FILES',
  CLEAR_FILES = 'CLEAR_FILES',
  UNRESOLVED_REASONING = 'UNRESOLVED_REASONING' // LLM fallback
}

export interface ExtractedPayload {
  oldName?: string;
  newName?: string;
  filePath?: string;
  sourcePath?: string;
  destPath?: string;
  target?: string;
  command?: string;
}

export interface IntentResult {
  intent: TaskIntent;
  payload: ExtractedPayload;
  rawInput: string;
}

/**
 * StructuralRegexClassifier scans inputs for deterministic patterns.
 * Time Complexity: O(M) where M is the number of regular expressions matching against input length.
 * Space Complexity: O(1) no heap buffers are allocated during matching.
 */
export class StructuralRegexClassifier {
  // Regex pattern rules mapping to corresponding Intents
  private static rules: { intent: TaskIntent; regex: RegExp; mapper: (matches: string[]) => ExtractedPayload }[] = [
    {
      intent: TaskIntent.RENAME_SYMBOL,
      // Pattern: "rename <symbol> to <newSymbol> in <path>"
      regex: /^rename\s+([a-zA-Z_]\w*)\s+to\s+([a-zA-Z_]\w*)\s+in\s+(\S+)$/i,
      mapper: (m) => ({ oldName: m[1], newName: m[2], filePath: m[3] })
    },
    {
      intent: TaskIntent.MOVE_FILE,
      // Pattern: "move <path> to <path>"
      regex: /^move\s+(\S+)\s+to\s+(\S+)$/i,
      mapper: (m) => ({ sourcePath: m[1], destPath: m[2], filePath: m[1] }) // set filePath to source for evaluation
    },
    {
      intent: TaskIntent.CREATE_FILE,
      // Pattern: "create file <path>" or "write file <path>"
      regex: /^(?:create|write)\s+file\s+(\S+)$/i,
      mapper: (m) => ({ filePath: m[1], target: m[1] })
    },
    {
      intent: TaskIntent.DELETE_FILE,
      // Pattern: "delete file <path>" or "remove file <path>"
      regex: /^(?:delete|remove|rm)\s+file\s+(\S+)$/i,
      mapper: (m) => ({ filePath: m[1], target: m[1] })
    },
    {
      intent: TaskIntent.FORMAT_CODE,
      // Pattern: "format <path>"
      regex: /^format\s+(\S+)$/i,
      mapper: (m) => ({ target: m[1], filePath: m[1] })
    },
    {
      intent: TaskIntent.RUN_LINT,
      // Pattern: "lint <path>"
      regex: /^lint\s+(\S+)$/i,
      mapper: (m) => ({ target: m[1], filePath: m[1] })
    },
    {
      intent: TaskIntent.RUN_TEST,
      // Pattern: "test <path>"
      regex: /^test\s+(\S+)$/i,
      mapper: (m) => ({ target: m[1] })
    },
    {
      intent: TaskIntent.RUN_BUILD,
      // Pattern: "build" or "compile" exactly (with optional "run" prefix)
      regex: /^(?:run\s+)?build$|^(?:run\s+)?compile$/i,
      mapper: (m) => ({ command: m[0] })
    },
    {
      intent: TaskIntent.GIT_STATUS,
      // Pattern: "git status" or "status" exactly
      regex: /^(?:git\s+)?status$/i,
      mapper: () => ({})
    },
    {
      intent: TaskIntent.GIT_DIFF,
      // Pattern: "git diff" or "diff" exactly
      regex: /^(?:git\s+)?diff$/i,
      mapper: () => ({})
    },
    {
      intent: TaskIntent.COPY_FILES,
      // Pattern: "copy <src> to <dest>"
      regex: /^copy\s+(.+)\s+to\s+(.+)$/i,
      mapper: (m) => ({ 
        sourcePath: m[1].replace(/\buser_io\b/g, 'users_io').replace(/^(?:\.\/)?LLM-PRG\//, '').trim(), 
        destPath: m[2].replace(/\buser_io\b/g, 'users_io').replace(/^(?:\.\/)?LLM-PRG\//, '').trim(), 
        filePath: m[1].replace(/\buser_io\b/g, 'users_io').replace(/^(?:\.\/)?LLM-PRG\//, '').trim() 
      })
    },
    {
      intent: TaskIntent.CLEAR_FILES,
      // Pattern: "clear all file in <path>" or "clear files in <path>" or "clear <path>"
      regex: /^(?:clear\s+all\s+file\s+in|clear\s+files\s+in|clear)\s+(.+)$/i,
      mapper: (m) => ({ 
        filePath: m[1].replace(/\buser_io\b/g, 'users_io').replace(/^(?:\.\/)?LLM-PRG\//, '').trim(), 
        target: m[1].replace(/\buser_io\b/g, 'users_io').replace(/^(?:\.\/)?LLM-PRG\//, '').trim() 
      })
    }
  ];

  /**
   * Evaluates input string and returns parsed intent.
   * If no pattern matches, returns UNRESOLVED_REASONING to signal LLM execution routing.
   */
  public static classify(input: string): IntentResult {
    const trimmedInput = input.trim();

    for (const rule of this.rules) {
      const match = trimmedInput.match(rule.regex);
      if (match) {
        return {
          intent: rule.intent,
          payload: rule.mapper(match),
          rawInput: trimmedInput
        };
      }
    }

    // Default to reasoning agent for complex architectural or general queries
    return {
      intent: TaskIntent.UNRESOLVED_REASONING,
      payload: {},
      rawInput: trimmedInput
    };
  }
}
