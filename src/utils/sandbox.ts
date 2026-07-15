import * as fs from 'fs';
import * as path from 'path';
import { ChildProcess } from 'child_process';

// Registry of running child processes to terminate on abort
export const activeProcesses = new Set<ChildProcess>();

/**
 * Register a spawned child process.
 */
export function registerProcess(proc: ChildProcess): void {
  activeProcesses.add(proc);
}

/**
 * Unregister a completed child process.
 */
export function unregisterProcess(proc: ChildProcess): void {
  activeProcesses.delete(proc);
}

/**
 * Validates that the target path resolves strictly within the current working directory sandbox.
 * If the path escapes the sandbox, triggers an IMMEDIATE KERNEL ABORT.
 */
export function ensureSandbox(targetPath: string): string {
  const projectRoot = fs.realpathSync(process.cwd());
  let resolvedPath = '';

  try {
    const absoluteTarget = path.resolve(process.cwd(), targetPath);
    
    // Check if the target path or its closest existing parent path exists to resolve symlinks
    if (fs.existsSync(absoluteTarget)) {
      resolvedPath = fs.realpathSync(absoluteTarget);
    } else {
      let current = absoluteTarget;
      while (current !== path.dirname(current) && !fs.existsSync(current)) {
        current = path.dirname(current);
      }
      const canonicalParent = fs.realpathSync(current);
      const relativeSub = path.relative(current, absoluteTarget);
      resolvedPath = path.resolve(canonicalParent, relativeSub);
    }
  } catch (err) {
    resolvedPath = path.resolve(process.cwd(), targetPath);
  }

  const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
  const isInside = resolvedPath === projectRoot || resolvedPath.startsWith(rootWithSep);

  if (!isInside) {
    // IMMEDIATE KERNEL ABORT
    console.error(`\n\x1b[1m\x1b[31m[IMMEDIATE KERNEL ABORT] Sandbox Containment Violation!\x1b[0m`);
    console.error(`\x1b[31mPath escapes the Project Root Directory sandbox:\x1b[0m`);
    console.error(`  Attempted Target: ${targetPath}`);
    console.error(`  Resolved Path:    ${resolvedPath}`);
    console.error(`  Allowed Root:     ${projectRoot}\n`);
    
    // 1. Terminate all child processes
    if (activeProcesses.size > 0) {
      console.error(`\x1b[31mTerminating ${activeProcesses.size} active child processes...\x1b[0m`);
      for (const proc of activeProcesses) {
        try {
          proc.kill('SIGKILL');
        } catch {}
      }
      activeProcesses.clear();
    }

    // 2. Flush volatile states (Journal / Summary fallback)
    try {
      const journalPath = path.resolve(projectRoot, '.lars', 'lars.journal');
      if (fs.existsSync(journalPath)) {
        const state = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
        state.buildHealthy = false;
        state.compressedSummary = `ABORTED: Sandbox Violation on '${targetPath}'`;
        fs.writeFileSync(journalPath, JSON.stringify(state, null, 2), 'utf8');
      }
    } catch {}

    // 3. Process exit code 1
    process.exit(1);
  }

  return resolvedPath;
}
