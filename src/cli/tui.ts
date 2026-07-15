import * as readline from 'readline';

export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  
  // Foreground Colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Bright Foreground Colors
  brightBlack: '\x1b[90m', // Gray
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  
  // Background Colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

/**
 * Highlights a block of code using basic ANSI regex matching.
 */
export function highlightCode(code: string, lang: string): string {
  const cleanLang = lang.toLowerCase().replace(/^\./, '');
  const lines = code.split('\n');
  const highlightedLines = lines.map(line => {
    let hl = line;

    // String literals: "string" or 'string' or `string`
    hl = hl.replace(/(["'`])(.*?)\1/g, `${COLORS.brightYellow}$1$2$1${COLORS.reset}`);

    // Comments: // or # or /* */
    if (cleanLang === 'py') {
      hl = hl.replace(/(#.*)$/g, `${COLORS.brightBlack}$1${COLORS.reset}`);
    } else if (cleanLang === 'cpp' || cleanLang === 'ts' || cleanLang === 'js' || cleanLang === 'tsx' || cleanLang === 'jsx') {
      hl = hl.replace(/(\/\/.*)$/g, `${COLORS.brightBlack}$1${COLORS.reset}`);
    }

    // Keywords
    let keywords: string[] = [];
    if (cleanLang === 'py') {
      keywords = ['def', 'class', 'import', 'from', 'as', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'and', 'or', 'not', 'try', 'except', 'finally', 'pass', 'lambda', 'with', 'yield', 'async', 'await'];
    } else if (cleanLang === 'cpp') {
      keywords = ['class', 'struct', 'void', 'int', 'double', 'float', 'char', 'bool', 'if', 'else', 'for', 'while', 'do', 'return', 'public', 'private', 'protected', 'namespace', 'using', 'std', 'include', 'define', 'const', 'virtual', 'override'];
    } else {
      // Default to TS/JS
      keywords = ['const', 'let', 'var', 'function', 'class', 'interface', 'type', 'import', 'export', 'from', 'default', 'return', 'if', 'else', 'for', 'while', 'async', 'await', 'try', 'catch', 'finally', 'new', 'this', 'extends', 'implements'];
    }

    for (const kw of keywords) {
      const regex = new RegExp(`\\b(${kw})\\b`, 'g');
      hl = hl.replace(regex, `${COLORS.magenta}$1${COLORS.reset}`);
    }

    // Functions/Methods definition
    hl = hl.replace(/\b([a-zA-Z_]\w*)\s*\(/g, `${COLORS.cyan}$1${COLORS.reset}(`);

    return hl;
  });

  return highlightedLines.join('\n');
}

/**
 * Prints a beautiful border-encased box.
 */
export function printBox(title: string, content: string, borderColor: string = COLORS.cyan): void {
  const termWidth = 72;
  const horizontalBorder = '─'.repeat(termWidth - 2);
  
  console.log(`${borderColor}┌${horizontalBorder}┐${COLORS.reset}`);
  
  // Styled Title
  const paddedTitle = ` ${title.toUpperCase()} `;
  const titleLeftPadLength = Math.max(2, Math.floor((termWidth - paddedTitle.length - 2) / 2));
  const titleRightPadLength = termWidth - 2 - titleLeftPadLength - paddedTitle.length;
  console.log(
    `${borderColor}│${COLORS.reset}` +
    ' '.repeat(titleLeftPadLength) +
    `${COLORS.bold}${borderColor}${paddedTitle}${COLORS.reset}` +
    ' '.repeat(titleRightPadLength) +
    `${borderColor}│${COLORS.reset}`
  );
  
  console.log(`${borderColor}├${horizontalBorder}┤${COLORS.reset}`);

  // Content lines
  const lines = content.split('\n');
  for (const line of lines) {
    // Strip ANSI escape codes to measure true content length
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
    const excess = cleanLine.length - (termWidth - 4);
    
    if (excess <= 0) {
      const padding = ' '.repeat(termWidth - 4 - cleanLine.length);
      console.log(`${borderColor}│${COLORS.reset}  ${line}${padding}  ${borderColor}│${COLORS.reset}`);
    } else {
      // Wrap long lines
      let currentLine = line;
      while (currentLine.replace(/\x1b\[[0-9;]*m/g, '').length > 0) {
        let chunk = '';
        let charCount = 0;
        let inAnsi = false;
        let cutIndex = 0;

        // Traverse string and cut at termWidth - 4 printable characters
        for (let i = 0; i < currentLine.length; i++) {
          if (currentLine[i] === '\x1b') {
            inAnsi = true;
          }
          if (inAnsi) {
            if (currentLine[i] === 'm') {
              inAnsi = false;
            }
          } else {
            charCount++;
          }
          if (charCount > termWidth - 4) {
            cutIndex = i;
            break;
          }
        }

        if (cutIndex === 0) {
          chunk = currentLine;
          currentLine = '';
        } else {
          chunk = currentLine.substring(0, cutIndex);
          currentLine = currentLine.substring(cutIndex);
        }

        const cleanChunk = chunk.replace(/\x1b\[[0-9;]*m/g, '');
        const padding = ' '.repeat(termWidth - 4 - cleanChunk.length);
        console.log(`${borderColor}│${COLORS.reset}  ${chunk}${padding}  ${borderColor}│${COLORS.reset}`);
      }
    }
  }

  console.log(`${borderColor}└${horizontalBorder}┘${COLORS.reset}`);
}

/**
 * Renders LARS visual ascii art header.
 */
export function printHeader(): void {
  console.log(`\n${COLORS.bold}${COLORS.cyan}     __         ___          ___   ___ `);
  console.log(`    /  \\       /   \\        /   \\ /   \\`);
  console.log(`   /    \\     /_____\\      /___/  \\___ `);
  console.log(`  /______\\   /       \\    /   \\   ____/`);
  console.log(` /        \\ /         \\  /     \\  \\___\\`);
  console.log(`\n      Local Agent Reasoning Scheduler (LARS) ${COLORS.reset}${COLORS.dim}v1.1.0${COLORS.reset}`);
  console.log(`${COLORS.dim}   Multi-Agent Collaborative System — Sandboxed Workspace & TUI${COLORS.reset}\n`);
}

/**
 * Prints a message from a specific Agent with custom persona framing.
 */
export function printAgentMessage(agentName: string, role: string, message: string, color: string = COLORS.green): void {
  const header = `🤖 [${agentName.toUpperCase()} - ${role.toUpperCase()}]`;
  printBox(header, message, color);
}

/**
 * Renders the planner queue status.
 */
export function printTaskQueue(tasks: any[]): void {
  console.log(`\n${COLORS.bold}${COLORS.yellow}📋 PROGRESSIVE TASK PLAN QUEUE:${COLORS.reset}`);
  console.log(`${COLORS.dim}────────────────────────────────────────────────────────────────────────${COLORS.reset}`);
  for (const t of tasks) {
    let statusIcon = '⏳';
    let statusColor = COLORS.brightBlack;
    if (t.status === 'RUNNING') {
      statusIcon = '⚙️ ';
      statusColor = COLORS.brightYellow;
    } else if (t.status === 'COMPLETED') {
      statusIcon = '✅';
      statusColor = COLORS.brightGreen;
    } else if (t.status === 'FAILED') {
      statusIcon = '❌';
      statusColor = COLORS.brightRed;
    }

    console.log(
      `  ${statusIcon} ${statusColor}Step #${t.sequence}: ${t.description}${COLORS.reset}` +
      ` [${COLORS.bold}${t.intent}${COLORS.reset}]`
    );
  }
  console.log(`${COLORS.dim}────────────────────────────────────────────────────────────────────────${COLORS.reset}\n`);
}

/**
 * Interactive prompt for file CRUD authorization.
 * Returns true if the user approves, false otherwise.
 */
export function promptCrudApproval(action: string, target: string, reason: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const boxContent = 
      `${COLORS.bold}Action:${COLORS.reset} ${COLORS.brightRed}${action.toUpperCase()}${COLORS.reset}\n` +
      `${COLORS.bold}Target:${COLORS.reset} ${COLORS.brightCyan}${target}${COLORS.reset}\n` +
      `${COLORS.bold}Reason:${COLORS.reset} ${reason}\n\n` +
      `${COLORS.bold}${COLORS.yellow}CRITICAL: File modifications require explicit developer approval.${COLORS.reset}`;

    printBox('📁 FILE CRUD REQUEST', boxContent, COLORS.brightRed);

    rl.question(`\n   ${COLORS.bold}Approve this operation? (y/N): ${COLORS.reset}`, (answer) => {
      rl.close();
      const approved = answer.trim().toLowerCase() === 'y';
      if (approved) {
        console.log(`\n   ${COLORS.brightGreen}✓ Operation Approved by user.${COLORS.reset}\n`);
      } else {
        console.log(`\n   ${COLORS.brightRed}✗ Operation Denied by user.${COLORS.reset}\n`);
      }
      resolve(approved);
    });
  });
}
