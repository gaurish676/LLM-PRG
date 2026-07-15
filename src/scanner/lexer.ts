import { StringDecoder } from 'string_decoder';

export type LexState = 
  | 'NORMAL' 
  | 'SINGLE_LINE_COMMENT' 
  | 'MULTI_LINE_COMMENT' 
  | 'SINGLE_QUOTE_STRING' 
  | 'DOUBLE_QUOTE_STRING' 
  | 'TEMPLATE_STRING';

export interface RepairAction {
  offset: number;
  line: number;
  column: number;
  type: 'insert' | 'delete';
  value: string;
  description: string;
}

export interface LexerResult {
  balanced: boolean;
  anomalies: number;
  repairs: RepairAction[];
  autoFixString: string;
}

/**
 * StreamingLexicalBroker parses incoming text chunks (or raw binary TCP/socket buffers)
 * byte-by-byte or character-by-character to maintain bracket balances ({}, [], ()).
 * 
 * Performance characteristics:
 * - Time Complexity: O(N) linear time scan
 * - Space Complexity: O(1) space complexity relative to stream size.
 *   Uses a strictly bounded pushdown stack of maximum depth (default 1024).
 * - Bufferless: Does not aggregate stream chunks in RAM; processes and discards them.
 */
export class StreamingLexicalBroker {
  private decoder = new StringDecoder('utf8');
  private state: LexState = 'NORMAL';
  private isEscaped = false;
  private lastChar = '';
  
  // Strict O(1) bounded bracket tracking stack
  private bracketStack: string[] = [];
  private readonly maxStackDepth: number;

  // Stream offsets & location tracking
  private absoluteOffset = 0;
  private currentLine = 1;
  private currentColumn = 1;

  // Syntactic diagnostics & repair actions
  private anomaliesCount = 0;
  private repairs: RepairAction[] = [];

  constructor(maxStackDepth = 1024) {
    this.maxStackDepth = maxStackDepth;
  }

  /**
   * Writes a chunk of characters or raw binary buffer to the broker.
   * Leverages StringDecoder to safely rebuild split UTF-8 character boundaries.
   */
  public write(chunk: string | Buffer): void {
    const text = typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      this.processChar(char);
      
      // Update tracking statistics
      this.absoluteOffset++;
      if (char === '\n') {
        this.currentLine++;
        this.currentColumn = 1;
      } else {
        this.currentColumn++;
      }
      this.lastChar = char;
    }
  }

  /**
   * Process a single character. Manages lexing state transitions and balance checks.
   */
  private processChar(char: string): void {
    // 1. Escaping rules (only active within strings)
    if (this.isEscaped) {
      this.isEscaped = false;
      return;
    }

    // 2. Lexical State Transitions
    switch (this.state) {
      case 'SINGLE_LINE_COMMENT':
        if (char === '\n' || char === '\r') {
          this.state = 'NORMAL';
        }
        return;

      case 'MULTI_LINE_COMMENT':
        if (char === '/' && this.lastChar === '*') {
          this.state = 'NORMAL';
        }
        return;

      case 'SINGLE_QUOTE_STRING':
        if (char === '\\') {
          this.isEscaped = true;
        } else if (char === "'") {
          this.state = 'NORMAL';
        }
        return;

      case 'DOUBLE_QUOTE_STRING':
        if (char === '\\') {
          this.isEscaped = true;
        } else if (char === '"') {
          this.state = 'NORMAL';
        }
        return;

      case 'TEMPLATE_STRING':
        if (char === '\\') {
          this.isEscaped = true;
        } else if (char === '`') {
          this.state = 'NORMAL';
        }
        return;

      case 'NORMAL':
        // Comment transitions
        if (char === '/' && this.lastChar === '/') {
          this.state = 'SINGLE_LINE_COMMENT';
          return;
        }
        if (char === '*' && this.lastChar === '/') {
          this.state = 'MULTI_LINE_COMMENT';
          return;
        }

        // String transitions
        if (char === "'") {
          this.state = 'SINGLE_QUOTE_STRING';
          return;
        }
        if (char === '"') {
          this.state = 'DOUBLE_QUOTE_STRING';
          return;
        }
        if (char === '`') {
          this.state = 'TEMPLATE_STRING';
          return;
        }

        // Handle structural bracket events
        if (char === '(' || char === '{' || char === '[') {
          this.pushBracket(char);
        } else if (char === ')' || char === '}' || char === ']') {
          this.popBracket(char);
        }
        return;
    }
  }

  private pushBracket(bracket: string): void {
    if (this.bracketStack.length < this.maxStackDepth) {
      this.bracketStack.push(bracket);
    } else {
      // Hard stack overflow boundary
      this.anomaliesCount++;
      this.repairs.push({
        offset: this.absoluteOffset,
        line: this.currentLine,
        column: this.currentColumn,
        type: 'delete',
        value: bracket,
        description: `Max bracket depth limit (${this.maxStackDepth}) reached; discarding bracket.`
      });
    }
  }

  private popBracket(closeBracket: string): void {
    const expectedOpen = this.getMatchingOpen(closeBracket);

    if (this.bracketStack.length === 0) {
      // Extra closing bracket found with no matching open bracket
      this.anomaliesCount++;
      this.repairs.push({
        offset: this.absoluteOffset,
        line: this.currentLine,
        column: this.currentColumn,
        type: 'delete',
        value: closeBracket,
        description: `Extra closing '${closeBracket}' with no preceding open match; deleted.`
      });
      return;
    }

    const lastOpen = this.bracketStack[this.bracketStack.length - 1];

    if (lastOpen === expectedOpen) {
      // Perfect structural match
      this.bracketStack.pop();
    } else {
      // Structural anomaly: mismatching bracket. E.g. '{' closed by ']'
      this.anomaliesCount++;
      
      const correctClose = this.getMatchingClose(lastOpen);
      this.repairs.push({
        offset: this.absoluteOffset,
        line: this.currentLine,
        column: this.currentColumn,
        type: 'insert',
        value: correctClose,
        description: `Mismatch: Expected '${correctClose}' to close '${lastOpen}', but found '${closeBracket}'. Auto-inserting '${correctClose}'.`
      });
      
      // Rectify stack immediately by popping the mismatch target
      this.bracketStack.pop();

      // Recurse to verify the current closeBracket against the rest of the stack
      this.popBracket(closeBracket);
    }
  }

  private getMatchingOpen(close: string): string {
    switch (close) {
      case ')': return '(';
      case '}': return '{';
      case ']': return '[';
      default: return '';
    }
  }

  private getMatchingClose(open: string): string {
    switch (open) {
      case '(': return ')';
      case '{': return '}';
      case '[': return ']';
      default: return '';
    }
  }

  /**
   * Finalizes analysis. Any dangling open brackets remaining on the stack
   * are closed in reverse order to yield a syntactically valid completion string.
   */
  public finalize(): LexerResult {
    // Flush any pending trailing data from the StringDecoder
    const remainingText = this.decoder.end();
    if (remainingText.length > 0) {
      for (const char of remainingText) {
        this.processChar(char);
      }
    }

    const trailingFixes: string[] = [];

    // All unmatched brackets remaining on stack require closing
    while (this.bracketStack.length > 0) {
      const open = this.bracketStack.pop()!;
      const close = this.getMatchingClose(open);
      this.anomaliesCount++;
      
      this.repairs.push({
        offset: this.absoluteOffset,
        line: this.currentLine,
        column: this.currentColumn,
        type: 'insert',
        value: close,
        description: `Unterminated open '${open}' at EOF; auto-closing with '${close}'.`
      });
      
      trailingFixes.push(close);
    }

    return {
      balanced: this.anomaliesCount === 0,
      anomalies: this.anomaliesCount,
      repairs: this.repairs,
      autoFixString: trailingFixes.join('')
    };
  }
}
