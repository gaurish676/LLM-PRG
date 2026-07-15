import { parseArgs, ParsedArgs } from './cli/args';
import { CLICommands } from './cli/commands';
import { JournalService } from './core/memory/journal';
import { TaskIntent, StructuralRegexClassifier } from './scheduler/classifier';
import { MinimalSymbolDatabase } from './graph/db';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Executes a single parsed command state.
 * Returns success boolean and summary logs.
 */
async function executeParsed(
  command: string, 
  args: string[], 
  options: Record<string, string | boolean>,
  journal: any
): Promise<{ success: boolean; summary: string; activeModule: string; intent: string }> {
  
  let success = true;
  let summary = '';
  let activeModule = journal.activeModule;
  let intent = command.toUpperCase();

  switch (command) {
    case 'init':
      CLICommands.init();
      summary = 'Initialized LARS workspace';
      break;

    case 'scan':
      const isQuick = options.quick === true || options.q === true;
      if (isQuick && journal.activeModule && fs.existsSync(path.resolve(process.cwd(), journal.activeModule))) {
        console.log(`[SCAN OPTIMIZATION] Bypassing full directory crawler. Re-indexing active module: ${journal.activeModule}`);
        MinimalSymbolDatabase.scanFile(path.resolve(process.cwd(), journal.activeModule));
        
        const cachedSymbols = MinimalSymbolDatabase.getAllSymbols();
        const symbolFile = path.resolve(process.cwd(), '.lars', 'symbols.json');
        fs.writeFileSync(symbolFile, JSON.stringify(cachedSymbols, null, 2), 'utf8');

        summary = `Quick-scanned active module: ${journal.activeModule}`;
      } else {
        await CLICommands.scan();
        summary = 'Completed full directory sweep';
      }
      break;

      case 'ask':
        const prompt = args.join(' ');
        if (!prompt) {
          console.error('Error: Please provide a prompt. Usage: lars ask "<prompt>"');
          process.exit(1);
        }

        // Classify prompt to extract targets and set active modules
        const classifierResult = StructuralRegexClassifier.classify(prompt);
        intent = classifierResult.intent;
        
        const extractedFile = classifierResult.payload.filePath || 
                              classifierResult.payload.sourcePath || 
                              classifierResult.payload.target;
                              
        if (extractedFile) {
          activeModule = extractedFile;
        }

        await CLICommands.ask(prompt);
        summary = `Executed: ${prompt.substring(0, 60)}`;
        break;

    case 'build':
      await CLICommands.build();
      summary = 'Ran project build compilation';
      break;

    case 'test':
      await CLICommands.test();
      summary = 'Ran test suite';
      break;

    case 'lint':
      await CLICommands.lint();
      summary = 'Ran lint analysis';
      break;

    case 'status':
      CLICommands.status();
      summary = 'Queried project status';
      break;

    case 'abort':
      const { ensureSandbox } = await import('./utils/sandbox');
      ensureSandbox('../killswitch_trigger'); // Force immediate kernel abort
      break;

    default:
      console.error(`Unknown command: ${command}`);
      success = false;
  }

  return { success, summary, activeModule, intent };
}

/**
 * Tokenizes a single line input from REPL, respecting quotes.
 */
function tokenizeLine(line: string): string[] {
  const matches = line.match(/"[^"]+"|\'[^\']+\'|\S+/g);
  return matches ? matches.map(m => m.replace(/^["']|["']$/g, '')) : [];
}

/**
 * Starts the interactive, sandboxed Chat loop (REPL).
 */
async function startChatLoop(): Promise<void> {
  const { printHeader, COLORS } = await import('./cli/tui');
  printHeader();
  console.log(`   ${COLORS.bold}${COLORS.yellow}Commands:${COLORS.reset} status, scan, build, test, lint, init`);
  console.log(`   ${COLORS.bold}${COLORS.green}Prompts:${COLORS.reset} Natural language queries (e.g. "create file test.py", "explain src/main.ts")`);
  console.log(`   ${COLORS.bold}${COLORS.red}Exit:${COLORS.reset} Type 'exit', 'quit', or Ctrl+C to terminate.\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${COLORS.bold}${COLORS.cyan}LARS ❯ ${COLORS.reset}`
  });

  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === 'exit' || trimmed === 'quit') {
      break;
    }
    if (trimmed.length === 0) {
      rl.prompt();
      continue;
    }

    // Tokenize REPL command input
    const tokens = tokenizeLine(trimmed);
    const firstToken = tokens[0].toLowerCase();
    
    const knownCommands = ['init', 'scan', 'ask', 'build', 'test', 'lint', 'status'];
    
    let command = 'ask';
    let args = tokens;
    
    if (knownCommands.includes(firstToken)) {
      command = firstToken;
      args = tokens.slice(1);
    }

    const journal = JournalService.hydrateContext();
    const result = await executeParsed(command, args, {}, journal);
    
    // Save updated state on each turn
    JournalService.compressState(result.intent, result.activeModule, result.success, result.summary);
    
    console.log(); // Blank line for spacing
    rl.prompt();
  }

  console.log('Goodbye!');
  const { promptSessionCleanup } = await import('./utils/io');
  await promptSessionCleanup();
}

/**
 * Main application execution loop.
 */
export async function run(): Promise<void> {
  const { ensureIOFolders, promptSessionCleanup } = await import('./utils/io');
  ensureIOFolders();

  const parsed = parseArgs(process.argv);

  if (parsed.command === 'chat') {
    // Validate initialization before booting chat
    const larsDir = path.resolve(process.cwd(), '.lars');
    if (!fs.existsSync(larsDir)) {
      console.log(`Initializing sandboxed configuration database...`);
      CLICommands.init();
    }
    await startChatLoop();
    return;
  }

  // Fallback to standard single CLI execution block
  const journal = JournalService.hydrateContext();
  
  if (parsed.command === 'help') {
    printHelp();
    return;
  }

  const result = await executeParsed(parsed.command, parsed.args, parsed.options, journal);
  JournalService.compressState(result.intent, result.activeModule, result.success, result.summary);

  if (parsed.command === 'ask') {
    await promptSessionCleanup();
  }
}

function printHelp() {
  console.log(`LARS (Local Agent Reasoning Scheduler) — CLI Backend (Phase 1)

Usage:
  lars init            Initialize a new sandboxed .lars configuration directory.
  lars scan            Traverse repository, parse code symbols, and cache index.
  lars ask "<prompt>"  Parse prompt and route to deterministic executors or local LLM.
  lars chat            Start stateful, interactive terminal assistant loop (REPL).
  lars build           Trigger local project compilation.
  lars test            Execute local tests.
  lars lint            Run lint checks.
  lars status          Print last scan times and build status statistics.
  lars abort           Trigger immediate kernel abort (sandbox killswitch).

Options:
  -q, --quick          Skip full directory scans and re-index only the active module.
`);
}
