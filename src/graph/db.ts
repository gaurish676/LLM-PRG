import * as fs from 'fs';
import * as path from 'path';
import { ensureSandbox } from '../utils/sandbox';

export interface SymbolDefinition {
  name: string;
  type: 'class' | 'interface' | 'function' | 'const';
  signature: string;
  filePath: string;
}

/**
 * MinimalSymbolDatabase handles local symbol extraction and indexing.
 * Time Complexity: O(L) where L is the number of lines in a file.
 * Space Complexity: O(1) relative to heap memory (processes lines iteratively).
 */
export class MinimalSymbolDatabase {
  private static symbolRegistry: Map<string, SymbolDefinition[]> = new Map();

  /**
   * Scans a file and caches its declarations (class, interface, functions, exports).
   */
  public static scanFile(filePath: string): SymbolDefinition[] {
    ensureSandbox(filePath);
    const symbols: SymbolDefinition[] = [];
    if (!fs.existsSync(filePath)) return symbols;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.py') {
        const pyClassRegex = /^class\s+([a-zA-Z_]\w*)/;
        const pyDefRegex = /^\s*def\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/;
        const pyConstRegex = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/;

        for (const line of lines) {
          const trimmed = line.trim();
          let match = trimmed.match(pyClassRegex);
          if (match) {
            symbols.push({ name: match[1], type: 'class', signature: trimmed, filePath });
            continue;
          }

          match = trimmed.match(pyDefRegex);
          if (match) {
            symbols.push({ name: match[1], type: 'function', signature: trimmed.split(':')[0].trim(), filePath });
            continue;
          }

          match = trimmed.match(pyConstRegex);
          if (match) {
            symbols.push({ name: match[1], type: 'const', signature: trimmed, filePath });
          }
        }
      } else if (ext === '.cpp' || ext === '.h' || ext === '.hpp' || ext === '.c') {
        const cppClassRegex = /^(?:class|struct)\s+([a-zA-Z_]\w*)/;
        const cppFuncRegex = /^(?:[a-zA-Z_]\w*(?:\s*::)?\s+)+([a-zA-Z_]\w*)\s*\(([^)]*)\)/;

        for (const line of lines) {
          const trimmed = line.trim();
          let match = trimmed.match(cppClassRegex);
          if (match) {
            symbols.push({ name: match[1], type: 'class', signature: trimmed, filePath });
            continue;
          }

          match = trimmed.match(cppFuncRegex);
          if (match && !trimmed.startsWith('if') && !trimmed.startsWith('while') && !trimmed.startsWith('for') && !trimmed.startsWith('return')) {
            symbols.push({ name: match[1], type: 'function', signature: trimmed.split('{')[0].trim(), filePath });
          }
        }
      } else {
        const classRegex = /^(?:export\s+)?class\s+([a-zA-Z_]\w*)/;
        const interfaceRegex = /^(?:export\s+)?interface\s+([a-zA-Z_]\w*)/;
        const functionRegex = /^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/;
        const constRegex = /^(?:export\s+)?const\s+([a-zA-Z_]\w*)\s*[:=]/;

        for (const line of lines) {
          const trimmed = line.trim();
          
          let match = trimmed.match(classRegex);
          if (match) {
            symbols.push({ name: match[1], type: 'class', signature: trimmed, filePath });
            continue;
          }

          match = trimmed.match(interfaceRegex);
          if (match) {
            symbols.push({ name: match[1], type: 'interface', signature: trimmed, filePath });
            continue;
          }

          match = trimmed.match(functionRegex);
          if (match) {
            symbols.push({
              name: match[1],
              type: 'function',
              signature: trimmed.split('{')[0].trim(),
              filePath
            });
            continue;
          }

          match = trimmed.match(constRegex);
          if (match) {
            // Exclude simple internal variables
            if (trimmed.includes('export') || trimmed.includes(':')) {
              symbols.push({ name: match[1], type: 'const', signature: trimmed, filePath });
            }
          }
        }
      }
      
      this.symbolRegistry.set(filePath, symbols);
    } catch {
      // Gracefully bypass unreadable files
    }

    return symbols;
  }

  /**
   * Searches for a symbol by name in the cached database registry.
   */
  public static findSymbol(name: string): SymbolDefinition | null {
    for (const symbols of this.symbolRegistry.values()) {
      const found = symbols.find(s => s.name === name);
      if (found) return found;
    }
    return null;
  }

  /**
   * Scans a list of files to populate the registry cache.
   */
  public static indexWorkspace(filePaths: string[]): void {
    this.symbolRegistry.clear();
    for (const filePath of filePaths) {
      this.scanFile(filePath);
    }
  }

  /**
   * Returns all cached symbols.
   */
  public static getAllSymbols(): SymbolDefinition[] {
    const list: SymbolDefinition[] = [];
    for (const symbols of this.symbolRegistry.values()) {
      list.push(...symbols);
    }
    return list;
  }
}
