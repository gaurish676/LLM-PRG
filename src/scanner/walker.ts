import { opendir } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { ensureSandbox } from '../utils/sandbox';

export interface WalkerOptions {
  /**
   * Set of directory names to drop immediately at the boundary.
   * Defaults to ['node_modules', '.git', 'dist', '.lars']
   */
  ignoreDirs?: Set<string>;
  
  /**
   * Set of file extensions to allow (e.g., '.ts', '.js').
   * If undefined, all files are returned.
   */
  allowedExtensions?: Set<string>;
}

/**
 * An ultra-lightweight, zero-allocation asynchronous directory tree walker.
 * Yields file paths one-by-one using an AsyncGenerator to keep memory usage strictly bounded.
 * Drops heavy directories at the boundary without traversing them or reading their metadata.
 */
export async function* walkDirectory(
  rootDirectory: string,
  currentDirectory: string = rootDirectory,
  options: WalkerOptions = {}
): AsyncGenerator<string> {
  const ignoreDirs = options.ignoreDirs || new Set(['node_modules', '.git', 'dist', '.lars']);
  const allowedExtensions = options.allowedExtensions;

  // Enforce directory containment boundary to prevent leakage
  ensureSandbox(currentDirectory);

  let dirIterator;
  try {
    // opendir returns an iterator that reads directory entries lazily in chunks from the OS
    dirIterator = await opendir(currentDirectory);
  } catch (err) {
    // Gracefully ignore unreadable directories (e.g. permission issues) without crashing the walker
    return;
  }

  try {
    for await (const entry of dirIterator) {
      const fullPath = join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        // Drop heavy or ignored directories at the boundary before recursion
        if (ignoreDirs.has(entry.name)) {
          continue;
        }
        
        // Recursive walk
        yield* walkDirectory(rootDirectory, fullPath, options);
      } else if (entry.isFile()) {
        if (allowedExtensions) {
          const dotIdx = entry.name.lastIndexOf('.');
          const ext = dotIdx !== -1 ? entry.name.substring(dotIdx) : '';
          if (!allowedExtensions.has(ext)) {
            continue;
          }
        }
        yield fullPath;
      }
    }
  } catch (err) {
    // Catch iteration failures gracefully to keep other branches running
  }
}
