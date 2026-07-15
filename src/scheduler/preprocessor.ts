import { MinimalSymbolDatabase, SymbolDefinition } from '../graph/db';
import * as path from 'path';
import * as fs from 'fs';
import { ensureSandbox } from '../utils/sandbox';

export interface CompiledPrompt {
  prompt: string;
  injectedSymbols: string[];
}

/**
 * StructuralContextCompiler matches user requests with specific symbol declarations
 * in the repository graph and generates highly-condensed prompt structures.
 */
export class StructuralContextCompiler {

  /**
   * Compiles the optimal prompt context by resolving mentions of files and symbols.
   */
  public static compile(rawQuery: string): CompiledPrompt {
    // 1. Tokenize query using spaces and brackets, keeping dots and path slashes intact
    const rawTokens = rawQuery.split(/[\s;!?()'"\[\]{}]+/);
    const matchedSymbols = new Map<string, SymbolDefinition>();
    const matchedFiles = new Set<string>();

    const allSymbols = MinimalSymbolDatabase.getAllSymbols();

    for (const rawToken of rawTokens) {
      const token = rawToken.replace(/[.,;:!?]+$/, '').trim();
      if (token.length < 3) continue;

      // Check if token references a cached symbol name (exact match)
      const foundSymbol = allSymbols.find(s => s.name === token);
      if (foundSymbol) {
        matchedSymbols.set(foundSymbol.name, foundSymbol);
      }

      // Check if token references a file extension/name
      if (token.includes('.') || token.includes('/')) {
        ensureSandbox(token);
        const baseName = token.split('/').pop() || '';
        
        // Direct file matching if the token exists as a file relative to workspace
        const directPath = path.resolve(process.cwd(), token);
        if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
          matchedFiles.add(token);
        } else {
          // Look up symbols matching that file name base
          for (const symbol of allSymbols) {
            const symBase = path.basename(symbol.filePath);
            if (symBase.toLowerCase() === baseName.toLowerCase()) {
              matchedFiles.add(symbol.filePath);
            }
          }
        }
      }
    }

    const contextLines: string[] = [];
    const injectedSymbols: string[] = [];

    // 2. Inject file-level index and content boundaries
    if (matchedFiles.size > 0) {
      contextLines.push(`[RELEVANT FILES STRUCTURE & CONTENT]`);
      for (const filePath of matchedFiles) {
        ensureSandbox(filePath);
        contextLines.push(`File: ${filePath}`);
        
        try {
          const resolvedPath = path.resolve(process.cwd(), filePath);
          const stats = fs.statSync(resolvedPath);
          const maxByteLimit = 8192; // 8 KB safety threshold

          if (stats.size < maxByteLimit) {
            // Read and inject entire file context
            const content = fs.readFileSync(resolvedPath, 'utf8');
            contextLines.push(`[Content (Full)]:`);
            contextLines.push(content);
          } else {
            // Sliding window: Read first 2KB and last 2KB to conserve CPU/RAM
            const fd = fs.openSync(resolvedPath, 'r');
            const headBuffer = Buffer.alloc(2048);
            const tailBuffer = Buffer.alloc(2048);
            
            // Read head
            fs.readSync(fd, headBuffer, 0, 2048, 0);
            
            // Read tail
            const tailPos = Math.max(0, stats.size - 2048);
            fs.readSync(fd, tailBuffer, 0, 2048, tailPos);
            fs.closeSync(fd);

            contextLines.push(`[Content (Truncated from ${stats.size} bytes for memory conservation)]:`);
            contextLines.push(`=== FILE HEAD (First 2 KB) ===`);
            contextLines.push(headBuffer.toString('utf8').replace(/\0/g, ''));
            contextLines.push(`...\n=== FILE TAIL (Last 2 KB) ===`);
            contextLines.push(tailBuffer.toString('utf8').replace(/\0/g, ''));
          }
        } catch (err: any) {
          contextLines.push(`  (Unreadable: ${err.message})`);
        }

        const fileSymbols = allSymbols.filter(s => s.filePath === filePath);
        if (fileSymbols.length > 0) {
          contextLines.push(`[Exported Symbols]:`);
          for (const sym of fileSymbols) {
            contextLines.push(`  - [${sym.type}] ${sym.signature}`);
          }
        }
        contextLines.push('---');
      }
      contextLines.push('');
    }

    // Inject individual matched symbols next (if they weren't already added via file index)
    const uniqueSymbols = Array.from(matchedSymbols.values()).filter(
      sym => !matchedFiles.has(sym.filePath)
    );

    if (uniqueSymbols.length > 0) {
      contextLines.push(`[RELEVANT SYMBOLS]`);
      for (const sym of uniqueSymbols) {
        contextLines.push(`File: ${sym.filePath}`);
        contextLines.push(`  - [${sym.type}] ${sym.signature}`);
        injectedSymbols.push(sym.name);
      }
      contextLines.push('');
    }

    // Automatically inject files present in users_io/input folder so user doesn't need to name them
    const inputDir = path.resolve(process.cwd(), 'users_io/input');
    if (fs.existsSync(inputDir)) {
      try {
        const inputFiles = fs.readdirSync(inputDir);
        const validFiles = inputFiles.filter(f => fs.statSync(path.join(inputDir, f)).isFile());
        if (validFiles.length > 0) {
          contextLines.push(`[USERS I/O ATTACHED INPUT FILES]`);
          for (const file of validFiles) {
            const resolvedPath = path.join(inputDir, file);
            ensureSandbox(resolvedPath);
            contextLines.push(`File: users_io/input/${file}`);
            const stats = fs.statSync(resolvedPath);
            const maxByteLimit = 8192;
            if (stats.size < maxByteLimit) {
              const content = fs.readFileSync(resolvedPath, 'utf8');
              contextLines.push(`[Content (Full)]:`);
              contextLines.push(content);
            } else {
              const fd = fs.openSync(resolvedPath, 'r');
              const headBuffer = Buffer.alloc(2048);
              const tailBuffer = Buffer.alloc(2048);
              fs.readSync(fd, headBuffer, 0, 2048, 0);
              const tailPos = Math.max(0, stats.size - 2048);
              fs.readSync(fd, tailBuffer, 0, 2048, tailPos);
              fs.closeSync(fd);
              contextLines.push(`[Content (Truncated from ${stats.size} bytes)]:`);
              contextLines.push(`=== FILE HEAD (First 2 KB) ===`);
              contextLines.push(headBuffer.toString('utf8').replace(/\0/g, ''));
              contextLines.push(`...\n=== FILE TAIL (Last 2 KB) ===`);
              contextLines.push(tailBuffer.toString('utf8').replace(/\0/g, ''));
            }
            contextLines.push('---');
            injectedSymbols.push(`users_io/input/${file}`);
          }
          contextLines.push('');
        }
      } catch (err) {}
    }

    // 3. Compile prompt
    let compiledPrompt = '';
    if (contextLines.length > 0) {
      compiledPrompt = `You are a helpful programming assistant and system executor.
Analyze the provided codebase files and data context below. 
If the user asks to analyze, read, summarize, explain, or edit the attached files, answer the question directly using the actual content of the files. Do NOT write a program or outline steps explaining how to do it unless explicitly requested.

---
[CONTEXT INDEX]
${contextLines.join('\n')}
---

User Query: ${rawQuery}
`;
    } else {
      // Fallback for general programming questions with no local codebase context
      compiledPrompt = rawQuery;
    }

    return {
      prompt: compiledPrompt,
      injectedSymbols: [...Array.from(matchedFiles), ...injectedSymbols]
    };
  }
}
