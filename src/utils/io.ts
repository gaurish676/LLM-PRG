import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { COLORS, printBox } from '../cli/tui';
import { ensureSandbox } from './sandbox';

const USERS_IO_DIR = path.resolve(process.cwd(), 'users_io');
const INPUT_DIR = path.join(USERS_IO_DIR, 'input');
const OUTPUT_DIR = path.join(USERS_IO_DIR, 'output');

/**
 * Ensures the Users I/O folder structure exists.
 */
export function ensureIOFolders(): void {
  // Safe sandbox containment checks
  ensureSandbox(USERS_IO_DIR);
  
  if (!fs.existsSync(USERS_IO_DIR)) {
    fs.mkdirSync(USERS_IO_DIR, { recursive: true });
  }
  if (!fs.existsSync(INPUT_DIR)) {
    fs.mkdirSync(INPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Writes the streaming LLM response and extracts code blocks to output folder.
 */
export function writeOutputResponse(responseText: string): void {
  ensureIOFolders();
  
  const responsePath = path.join(OUTPUT_DIR, 'response.md');
  fs.writeFileSync(responsePath, responseText, 'utf8');

  // Extract Markdown code blocks: ```lang \n code \n ```
  const codeBlockRegex = /```([a-zA-Z0-9+#-]+)?\n([\s\S]*?)```/g;
  let match;
  let blockIndex = 1;

  // Clear previous extracted blocks
  const files = fs.readdirSync(OUTPUT_DIR);
  for (const file of files) {
    if (file.startsWith('code_block_') || file === 'response.md') {
      fs.unlinkSync(path.join(OUTPUT_DIR, file));
    }
  }

  // Rewrite base response
  fs.writeFileSync(responsePath, responseText, 'utf8');

  while ((match = codeBlockRegex.exec(responseText)) !== null) {
    const lang = (match[1] || 'txt').toLowerCase();
    const code = match[2];
    
    let ext = '.txt';
    if (['typescript', 'ts'].includes(lang)) ext = '.ts';
    else if (['javascript', 'js'].includes(lang)) ext = '.js';
    else if (['python', 'py'].includes(lang)) ext = '.py';
    else if (['cpp', 'cc', 'c++'].includes(lang)) ext = '.cpp';
    else if (['html'].includes(lang)) ext = '.html';
    else if (['css'].includes(lang)) ext = '.css';
    else if (['json'].includes(lang)) ext = '.json';
    else if (['bash', 'sh'].includes(lang)) ext = '.sh';
    else if (['markdown', 'md'].includes(lang)) ext = '.md';

    const blockFileName = `code_block_${blockIndex++}${ext}`;
    const blockPath = path.join(OUTPUT_DIR, blockFileName);
    fs.writeFileSync(blockPath, code.trim(), 'utf8');
  }

  console.log(`\n   ${COLORS.brightGreen}✓ Generated response and ${blockIndex - 1} code block file(s) saved to 'users_io/output/'${COLORS.reset}\n`);
}

/**
 * Prompts the user to clear the Users I/O folder space at the end of a session.
 */
export function promptSessionCleanup(): Promise<void> {
  return new Promise((resolve) => {
    ensureIOFolders();

    const inputFiles = fs.readdirSync(INPUT_DIR);
    const outputFiles = fs.readdirSync(OUTPUT_DIR);

    if (inputFiles.length === 0 && outputFiles.length === 0) {
      resolve();
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const boxContent = 
      `${COLORS.bold}Input Files: ${COLORS.reset} ${inputFiles.length} file(s)\n` +
      `${COLORS.bold}Output Files:${COLORS.reset} ${outputFiles.length} file(s)\n\n` +
      `${COLORS.yellow}Reminder: Copy output contents before clearing as they will be permanently deleted.${COLORS.reset}`;

    printBox('🧹 SESSION CLEANUP', boxContent, COLORS.yellow);

    rl.question(`\n   ${COLORS.bold}Clear Users I/O folders for the next session? (y/N): ${COLORS.reset}`, (answer) => {
      rl.close();
      const clear = answer.trim().toLowerCase() === 'y';
      
      if (clear) {
        // Delete all input files
        for (const file of inputFiles) {
          try {
            fs.unlinkSync(path.join(INPUT_DIR, file));
          } catch {}
        }
        // Delete all output files
        for (const file of outputFiles) {
          try {
            fs.unlinkSync(path.join(OUTPUT_DIR, file));
          } catch {}
        }
        console.log(`\n   ${COLORS.brightGreen}✓ Space cleared. Ready for next session.${COLORS.reset}\n`);
      } else {
        console.log(`\n   ${COLORS.dim}- Keeping session workspace data.${COLORS.reset}\n`);
      }
      resolve();
    });
  });
}
