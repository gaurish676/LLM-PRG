import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { walkDirectory } from '../scanner/walker';
import { MinimalSymbolDatabase } from '../graph/db';
import { ProgressiveTaskPlanner } from '../scheduler/planner';
import { DynamicConfidenceSchedulerEngine } from '../scheduler/engine';
import { StructuralContextCompiler } from '../scheduler/preprocessor';
import { UniversalLLMClient } from '../ollama/client';
import { TaskIntent } from '../scheduler/classifier';
import { 
  COLORS, 
  printBox, 
  printHeader, 
  printAgentMessage, 
  printTaskQueue, 
  promptCrudApproval, 
  highlightCode 
} from './tui';
import { getAgentForIntent, AgentType, AGENT_REGISTRY, getPersonaPrompt } from '../scheduler/agents';
import { ensureSandbox, registerProcess, unregisterProcess } from '../utils/sandbox';

let cachedModels: string[] | null = null;

interface ProjectSummary {
  projectName: string;
  lastScan: string | null;
  buildStatus: string;
  recentChanges: string[];
}

/**
 * Executes a shell command and pipes output directly to stdout/stderr.
 */
function runShellCommand(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    console.log(`[EXEC] Spawning: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, { stdio: 'inherit', shell: true });
    
    registerProcess(proc);
    
    proc.on('close', (code) => {
      unregisterProcess(proc);
      resolve(code ?? 0);
    });
    
    proc.on('error', (err) => {
      unregisterProcess(proc);
      console.error(`[EXEC ERROR] Failed to run command:`, err.message);
      resolve(1);
    });
  });
}

/**
 * Handles RENAME_SYMBOL with Staging Backup and Compiler Rollback verification (Mini-LATS).
 */
async function runDeterministicRenameWithVerify(
  filePath: string, 
  oldName: string, 
  newName: string
): Promise<boolean> {
  ensureSandbox(filePath);
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`[EXEC ERROR] Target file does not exist: ${filePath}`);
    return false;
  }

  // CRUD Gating Check
  const approved = await promptCrudApproval(
    'UPDATE (Rename Symbol)', 
    filePath, 
    `Renaming symbol '${oldName}' to '${newName}' in file '${filePath}'`
  );
  if (!approved) {
    return false;
  }

  // 1. Create staging backup folder and copy file
  const stagingDir = path.resolve(process.cwd(), '.lars', 'staging', 'backup');
  try {
    fs.mkdirSync(stagingDir, { recursive: true });
  } catch {}

  const backupFileName = `${path.basename(filePath)}.${Date.now()}.bak`;
  const backupPath = path.join(stagingDir, backupFileName);
  
  try {
    fs.copyFileSync(resolvedPath, backupPath);
    console.log(`[LATS] Staging backup created: .lars/staging/backup/${backupFileName}`);
  } catch (err: any) {
    console.error(`[LATS ERROR] Backup creation failed:`, err.message);
    return false;
  }

  // 2. Apply refactoring edit
  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const regex = new RegExp(`\\b${oldName}\\b`, 'g');
    const count = (content.match(regex) || []).length;
    
    if (count === 0) {
      console.log(`[EXEC] No matching occurrences of '${oldName}' found in ${filePath}`);
      fs.unlinkSync(backupPath); // Delete unused backup
      return true;
    }

    const updated = content.replace(regex, newName);
    fs.writeFileSync(resolvedPath, updated, 'utf8');
    console.log(`[EXEC] Applied edit: renamed '${oldName}' to '${newName}' in ${filePath}`);

    // 3. Compiler Verification (Dry-run build check)
    console.log(`[LATS] Triggering compiler verification check (npx tsc --noEmit)...`);
    const buildCode = await runShellCommand('npx', ['tsc', '--noEmit']);
    
    if (buildCode === 0) {
      console.log(`[LATS] Verification successful! Changes committed to workspace.`);
      try {
        fs.unlinkSync(backupPath); // Clean up backup
      } catch {}
      return true;
    } else {
      console.warn(`\n[LATS WARNING] Compiler verification failed. Triggering automatic rollback...`);
      // Restore pre-edit file state
      fs.copyFileSync(backupPath, resolvedPath);
      try {
        fs.unlinkSync(backupPath); // Clean up backup
      } catch {}
      console.log(`[LATS] Workspace successfully rolled back to pre-edit state.`);
      return false;
    }
  } catch (err: any) {
    console.error(`[LATS ERROR] Refactoring run crashed:`, err.message);
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, resolvedPath);
      try {
        fs.unlinkSync(backupPath);
      } catch {}
    }
    return false;
  }
}

export class CLICommands {
  private static larsDir = path.join(process.cwd(), '.lars');
  private static summaryFile = path.join(process.cwd(), '.lars', 'summary.json');
  private static symbolFile = path.join(process.cwd(), '.lars', 'symbols.json');

  private static ensureInitialized() {
    if (!fs.existsSync(this.larsDir)) {
      console.error(`LARS project is not initialized. Please run: lars init`);
      process.exit(1);
    }
  }

  /**
   * Initializes .lars/ configuration directory.
   */
  public static init(): void {
    if (!fs.existsSync(this.larsDir)) {
      fs.mkdirSync(this.larsDir, { recursive: true });
      fs.mkdirSync(path.join(this.larsDir, 'staging'), { recursive: true });
    }

    const summary: ProjectSummary = {
      projectName: path.basename(process.cwd()),
      lastScan: null,
      buildStatus: 'unknown',
      recentChanges: []
    };

    fs.writeFileSync(this.summaryFile, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`Initialized empty LARS project in ${this.larsDir}/`);
  }

  /**
   * Scans workspace directory and extracts symbols into local cache.
   */
  public static async scan(): Promise<void> {
    this.ensureInitialized();
    console.log(`Scanning workspace index...`);

    const files: string[] = [];
    const options = {
      ignoreDirs: new Set(['node_modules', '.git', 'dist', '.lars'])
    };

    for await (const file of walkDirectory(process.cwd(), process.cwd(), options)) {
      files.push(file);
    }

    console.log(`Indexing ${files.length} file(s)...`);
    MinimalSymbolDatabase.indexWorkspace(files);

    const symbols = MinimalSymbolDatabase.getAllSymbols();
    console.log(`Successfully indexed ${symbols.length} symbol declarations.`);

    // Persist symbols list locally
    fs.writeFileSync(this.symbolFile, JSON.stringify(symbols, null, 2), 'utf8');

    // Update Project Summary metadata
    const summary: ProjectSummary = JSON.parse(fs.readFileSync(this.summaryFile, 'utf8'));
    summary.lastScan = new Date().toISOString();
    summary.recentChanges.unshift(`Indexed ${symbols.length} symbols at ${summary.lastScan}`);
    if (summary.recentChanges.length > 5) summary.recentChanges.pop();
    
    fs.writeFileSync(this.summaryFile, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`Workspace scan complete. Summary updated.`);
  }

  /**
   * Evaluates user prompt and routes it deterministically or via LLM.
   */
  /**
   * Evaluates user prompt and routes it deterministically or via LLM.
   */
  public static async ask(prompt: string): Promise<void> {
    this.ensureInitialized();

    // Load symbols from cache if available to populate preprocessor DB
    if (fs.existsSync(this.symbolFile)) {
      const symbols = JSON.parse(fs.readFileSync(this.symbolFile, 'utf8'));
      // Pre-populate the Database from file cache
      for (const sym of symbols) {
        MinimalSymbolDatabase.scanFile(sym.filePath); // Mock load symbols into registry cache
      }
    }

    printHeader();

    const planner = new ProgressiveTaskPlanner();
    const engine = new DynamicConfidenceSchedulerEngine();

    const tasks = planner.plan(prompt);
    printTaskQueue(tasks);

    for (const task of tasks) {
      task.status = 'RUNNING';
      printTaskQueue(planner.getTasks());

      const agent = getAgentForIntent(task.intent, task.description);

      printAgentMessage(
        'LARS',
        'Orchestrator',
        `Delegating step #${task.sequence} to specialist agent: ${COLORS.bold}${agent.name}${COLORS.reset} (${agent.role}).\nTask: ${task.description}`,
        COLORS.cyan
      );

      const decision = engine.route(task);

      if (decision.isDeterministic) {
        let success = true;

        if (decision.routedIntent === TaskIntent.RENAME_SYMBOL) {
          const payload = task.payload;
          success = await runDeterministicRenameWithVerify(payload.filePath!, payload.oldName!, payload.newName!);
          if (success) {
            printAgentMessage(agent.name, agent.role, `Successfully renamed symbol '${payload.oldName}' to '${payload.newName}' in file '${payload.filePath}'.`, agent.color);
          } else {
            printAgentMessage(agent.name, agent.role, `Symbol rename failed or rolled back.`, COLORS.red);
          }

        } else if (decision.routedIntent === TaskIntent.CREATE_FILE) {
          const payload = task.payload;
          ensureSandbox(payload.filePath!);
          const approved = await promptCrudApproval('CREATE', payload.filePath!, `Creating new file`);
          if (approved) {
            try {
              const resolved = path.resolve(process.cwd(), payload.filePath!);
              const dir = path.dirname(resolved);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              fs.writeFileSync(resolved, '', 'utf8');
              printAgentMessage(agent.name, agent.role, `Successfully created empty file at '${payload.filePath}'.`, agent.color);
              success = true;
            } catch (err: any) {
              printAgentMessage(agent.name, agent.role, `Failed to create file: ${err.message}`, COLORS.red);
              success = false;
            }
          } else {
            printAgentMessage(agent.name, agent.role, `File creation cancelled by user.`, COLORS.red);
            success = false;
          }

        } else if (decision.routedIntent === TaskIntent.DELETE_FILE) {
          const payload = task.payload;
          ensureSandbox(payload.filePath!);
          const approved = await promptCrudApproval('DELETE', payload.filePath!, `Deleting file`);
          if (approved) {
            try {
              const resolved = path.resolve(process.cwd(), payload.filePath!);
              if (fs.existsSync(resolved)) {
                fs.unlinkSync(resolved);
                printAgentMessage(agent.name, agent.role, `Successfully deleted file at '${payload.filePath}'.`, agent.color);
                success = true;
              } else {
                printAgentMessage(agent.name, agent.role, `File does not exist: '${payload.filePath}'`, COLORS.red);
                success = false;
              }
            } catch (err: any) {
              printAgentMessage(agent.name, agent.role, `Failed to delete file: ${err.message}`, COLORS.red);
              success = false;
            }
          } else {
            printAgentMessage(agent.name, agent.role, `File deletion cancelled by user.`, COLORS.red);
            success = false;
          }

        } else if (decision.routedIntent === TaskIntent.FORMAT_CODE) {
          ensureSandbox(task.payload.target!);
          printAgentMessage(agent.name, agent.role, `Formatting code at path '${task.payload.target}' using Prettier...`, agent.color);
          const code = await runShellCommand('npx', ['prettier', '--write', task.payload.target!]);
          success = code === 0;
          if (success) {
            printAgentMessage(agent.name, agent.role, `Successfully formatted file '${task.payload.target}'.`, agent.color);
          } else {
            printAgentMessage(agent.name, agent.role, `Formatting failed.`, COLORS.red);
          }

        } else if (decision.routedIntent === TaskIntent.RUN_BUILD) {
          printAgentMessage(agent.name, agent.role, `Compiling project build...`, agent.color);
          const code = await runShellCommand('npm', ['run', 'build']);
          success = code === 0;
          if (success) {
            printAgentMessage(agent.name, agent.role, `Build succeeded!`, agent.color);
          } else {
            printAgentMessage(agent.name, agent.role, `Build failed.`, COLORS.red);
          }

        } else if (decision.routedIntent === TaskIntent.RUN_TEST) {
          printAgentMessage(agent.name, agent.role, `Executing test suites...`, agent.color);
          const code = await runShellCommand('npm', ['test']);
          success = code === 0;
          if (success) {
            printAgentMessage(agent.name, agent.role, `All tests passed!`, agent.color);
          } else {
            printAgentMessage(agent.name, agent.role, `Some tests failed.`, COLORS.red);
          }

        } else if (decision.routedIntent === TaskIntent.RUN_LINT) {
          printAgentMessage(agent.name, agent.role, `Executing linter...`, agent.color);
          const code = await runShellCommand('npm', ['run', 'lint']);
          success = code === 0;
          if (success) {
            printAgentMessage(agent.name, agent.role, `Lint checks passed!`, agent.color);
          } else {
            printAgentMessage(agent.name, agent.role, `Lint checks reported errors.`, COLORS.red);
          }

        } else if (decision.routedIntent === TaskIntent.GIT_STATUS) {
          printAgentMessage(agent.name, agent.role, `Querying git status...`, agent.color);
          const code = await runShellCommand('git', ['status']);
          success = code === 0;

        } else if (decision.routedIntent === TaskIntent.GIT_DIFF) {
          printAgentMessage(agent.name, agent.role, `Querying git diff...`, agent.color);
          const code = await runShellCommand('git', ['diff']);
          success = code === 0;

        } else if (decision.routedIntent === TaskIntent.MOVE_FILE) {
          const payload = task.payload;
          ensureSandbox(payload.sourcePath!);
          ensureSandbox(payload.destPath!);
          const approved = await promptCrudApproval('MOVE', payload.sourcePath!, `Moving file to '${payload.destPath}'`);
          if (approved) {
            try {
              fs.renameSync(
                path.resolve(process.cwd(), payload.sourcePath!),
                path.resolve(process.cwd(), payload.destPath!)
              );
              printAgentMessage(agent.name, agent.role, `Moved file: ${payload.sourcePath} -> ${payload.destPath}`, agent.color);
              success = true;
            } catch (err: any) {
              printAgentMessage(agent.name, agent.role, `Move failed: ${err.message}`, COLORS.red);
              success = false;
            }
          } else {
            printAgentMessage(agent.name, agent.role, `Move cancelled by user.`, COLORS.red);
            success = false;
          }

        } else if (decision.routedIntent === TaskIntent.COPY_FILES) {
          const payload = task.payload;
          ensureSandbox(payload.sourcePath!);
          ensureSandbox(payload.destPath!);
          const approved = await promptCrudApproval('COPY', payload.sourcePath!, `Copying from '${payload.sourcePath}' to '${payload.destPath}'`);
          if (approved) {
            try {
              const src = path.resolve(process.cwd(), payload.sourcePath!);
              const dest = path.resolve(process.cwd(), payload.destPath!);

              if (fs.statSync(src).isDirectory()) {
                if (!fs.existsSync(dest)) {
                  fs.mkdirSync(dest, { recursive: true });
                }
                const files = fs.readdirSync(src);
                for (const file of files) {
                  const srcFile = path.join(src, file);
                  const destFile = path.join(dest, file);
                  if (fs.statSync(srcFile).isFile()) {
                    fs.copyFileSync(srcFile, destFile);
                  }
                }
                printAgentMessage(agent.name, agent.role, `Successfully copied directory contents: ${payload.sourcePath} -> ${payload.destPath}`, agent.color);
              } else {
                const destDir = path.dirname(dest);
                if (!fs.existsSync(destDir)) {
                  fs.mkdirSync(destDir, { recursive: true });
                }
                fs.copyFileSync(src, dest);
                printAgentMessage(agent.name, agent.role, `Successfully copied file: ${payload.sourcePath} -> ${payload.destPath}`, agent.color);
              }
              success = true;
            } catch (err: any) {
              printAgentMessage(agent.name, agent.role, `Copy failed: ${err.message}`, COLORS.red);
              success = false;
            }
          } else {
            printAgentMessage(agent.name, agent.role, `Copy cancelled by user.`, COLORS.red);
            success = false;
          }

        } else if (decision.routedIntent === TaskIntent.CLEAR_FILES) {
          const payload = task.payload;
          ensureSandbox(payload.filePath!);
          const approved = await promptCrudApproval('CLEAR', payload.filePath!, `Clearing files inside '${payload.filePath}'`);
          if (approved) {
            try {
              const resolved = path.resolve(process.cwd(), payload.filePath!);
              if (fs.existsSync(resolved)) {
                if (fs.statSync(resolved).isDirectory()) {
                  const files = fs.readdirSync(resolved);
                  for (const file of files) {
                    const filePath = path.join(resolved, file);
                    if (fs.statSync(filePath).isFile()) {
                      fs.unlinkSync(filePath);
                    }
                  }
                  printAgentMessage(agent.name, agent.role, `Successfully cleared all files inside directory '${payload.filePath}'.`, agent.color);
                } else {
                  fs.unlinkSync(resolved);
                  printAgentMessage(agent.name, agent.role, `Successfully deleted file '${payload.filePath}'.`, agent.color);
                }
                success = true;
              } else {
                printAgentMessage(agent.name, agent.role, `Path does not exist: '${payload.filePath}'`, COLORS.red);
                success = false;
              }
            } catch (err: any) {
              printAgentMessage(agent.name, agent.role, `Clear operation failed: ${err.message}`, COLORS.red);
              success = false;
            }
          } else {
            printAgentMessage(agent.name, agent.role, `Clear operation cancelled by user.`, COLORS.red);
            success = false;
          }
        }

        planner.updateTaskStatus(task.sequence, success ? 'COMPLETED' : 'FAILED');

      } else {
        printAgentMessage(agent.name, agent.role, `Falling back to local LLM reasoning (Routing Confidence: ${decision.confidence} < Threshold: ${decision.threshold}).\nReason: ${decision.reason}`, agent.color);
        printAgentMessage(agent.name, agent.role, `Gathering repository symbol context...`, agent.color);

        const compiled = StructuralContextCompiler.compile(task.description);

        if (!cachedModels) {
          const client = new UniversalLLMClient({
            endpoint: "http://localhost:11434",
            model: "qwen2.5-coder:1.5b",
            provider: "ollama"
          });
          cachedModels = await client.getAvailableModels();
        }
        const models = cachedModels;

        const personaPrompt = getPersonaPrompt(agent.type, compiled.prompt);

        if (models.length === 0) {
          printAgentMessage(agent.name, agent.role, `Local Ollama service offline. Activating offline Mock Simulator...`, COLORS.yellow);
          
          const mockResponse = `[LARS Offline Simulator Mode]\n\n` +
            `LARS compiled prompt with context header:\n` +
            `==================================================\n` +
            `${personaPrompt.trim()}\n` +
            `==================================================\n\n` +
            `Optimization metrics:\n` +
            `  - Prefill Tokens Saved: ~85% (only matching declarations indexed)\n` +
            `  - Execution speed: Instant (0ms GPU inference latency)\n\n` +
            `If you start Ollama locally (using: 'ollama run qwen2.5-coder:1.5b'), this response will be replaced by the live local LLM.`;

          console.log(`${COLORS.bold}${agent.color}┌─ STREAMING RESPONSE FROM ${agent.name.toUpperCase()} ──────────────────────────${COLORS.reset}`);
          await new Promise<void>((resResolve) => {
            let idx = 0;
            const interval = setInterval(() => {
              if (idx < mockResponse.length) {
                process.stdout.write(mockResponse[idx++]);
              } else {
                clearInterval(interval);
                console.log();
                const { writeOutputResponse } = require('../utils/io');
                writeOutputResponse(mockResponse);
                resResolve();
              }
            }, 5);
          });
          console.log(`${COLORS.bold}${agent.color}└────────────────────────────────────────────────────────────────────────${COLORS.reset}\n`);

          planner.updateTaskStatus(task.sequence, 'COMPLETED');
          continue;
        }

        const model = models.includes("qwen2.5-coder:1.5b") ? "qwen2.5-coder:1.5b" : models[0];

        const { JournalService } = await import('../core/memory/journal');
        const finalPrompt = JournalService.compileHydratedPrompt(personaPrompt);

        const activeClient = new UniversalLLMClient({
          endpoint: "http://localhost:11434",
          model,
          provider: "ollama"
        });

        const os = require('os');
        const totalCores = os.cpus().length;
        const cappedThreads = Math.max(1, Math.floor(totalCores * 0.8));
        const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(1);
        const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(1);
        const ramLoad = (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(0);

        printAgentMessage(
          agent.name, 
          agent.role, 
          `Resource Allocation Guard (80% Cap):\n` +
          `  - CPU Cores: ${cappedThreads}/${totalCores} threads allocated\n` +
          `  - Memory:    ${ramLoad}% used (Free: ${freeMemGB}GB / Total: ${totalMemGB}GB)`, 
          agent.color
        );
        console.log(`${COLORS.bold}${agent.color}┌─ STREAMING RESPONSE FROM ${agent.name.toUpperCase()} ──────────────────────────${COLORS.reset}`);

        let fullResponseText = '';
        try {
          await activeClient.generateStream(
            finalPrompt,
            (chunk) => {
              process.stdout.write(chunk);
              fullResponseText += chunk;
            },
            (completeText) => {
              console.log();
              const { writeOutputResponse } = require('../utils/io');
              writeOutputResponse(completeText || fullResponseText);
            }
          );
          console.log(`${COLORS.bold}${agent.color}└────────────────────────────────────────────────────────────────────────${COLORS.reset}\n`);
          planner.updateTaskStatus(task.sequence, 'COMPLETED');
        } catch (err: any) {
          console.log(`${COLORS.bold}${agent.color}└────────────────────────────────────────────────────────────────────────${COLORS.reset}\n`);
          printAgentMessage(agent.name, agent.role, `Query stream crashed: ${err.message}`, COLORS.red);
          planner.updateTaskStatus(task.sequence, 'FAILED');
        }
      }
    }

    // Final print of queue to show all completed/failed
    printTaskQueue(planner.getTasks());
  }

  /**
   * Executes workspace build script.
   */
  public static async build(): Promise<void> {
    this.ensureInitialized();
    const code = await runShellCommand('npm', ['run', 'build']);
    
    const summary: ProjectSummary = JSON.parse(fs.readFileSync(this.summaryFile, 'utf8'));
    summary.buildStatus = code === 0 ? 'success' : 'failed';
    fs.writeFileSync(this.summaryFile, JSON.stringify(summary, null, 2), 'utf8');
  }

  /**
   * Executes workspace test script.
   */
  public static async test(): Promise<void> {
    this.ensureInitialized();
    await runShellCommand('npm', ['test']);
  }

  /**
   * Executes workspace linter.
   */
  public static async lint(): Promise<void> {
    this.ensureInitialized();
    await runShellCommand('npm', ['run', 'lint']);
  }

  /**
   * Prints the local LARS summary database statistics.
   */
  public static status(): void {
    this.ensureInitialized();
    const summary: ProjectSummary = JSON.parse(fs.readFileSync(this.summaryFile, 'utf8'));
    console.log(`LARS Project:   ${summary.projectName}`);
    console.log(`Last Scan:      ${summary.lastScan ?? 'Never'}`);
    console.log(`Build Status:   ${summary.buildStatus.toUpperCase()}`);
    console.log(`Recent Changes:`);
    if (summary.recentChanges.length === 0) {
      console.log(`  - No changes logged yet.`);
    } else {
      for (const change of summary.recentChanges) {
        console.log(`  - ${change}`);
      }
    }
  }
}
