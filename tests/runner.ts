import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface TestSpec {
  name: string;
  script: string;
  expectedExitCode: number;
  setup?: () => void | Promise<void>;
  verifyOutput?: (stdout: string, stderr: string) => boolean;
}

const tests: TestSpec[] = [
  {
    name: 'Journal & Incremental Scan Benchmark',
    script: 'dist/tests/journal.test.js',
    expectedExitCode: 0,
    setup: () => {
      // Ensure config directory exists
      const larsDir = path.resolve(process.cwd(), '.lars');
      if (!fs.existsSync(larsDir)) {
        fs.mkdirSync(larsDir, { recursive: true });
      }
    }
  },
  {
    name: 'Sandbox Escape Containment (Expected Failure)',
    script: 'dist/tests/sandbox-abort.test.js',
    expectedExitCode: 1,
    verifyOutput: (stdout, stderr) => {
      return stdout.includes('Sandbox Containment Violation!') || stderr.includes('Sandbox Containment Violation!');
    }
  },
  {
    name: 'Lexical Scanner & Walker Integrity',
    script: 'dist/tests/step3.test.js',
    expectedExitCode: 0,
    setup: () => {
      // Step 3 requires a staging directory with files
      const stagingPath = path.join(process.cwd(), '.lars', 'staging');
      if (!fs.existsSync(stagingPath)) {
        fs.mkdirSync(stagingPath, { recursive: true });
      }
      fs.writeFileSync(path.join(stagingPath, 'sample.ts'), 'export const a = 1; { bracket_unclosed = ( }');
    }
  },
  {
    name: 'Task Planner & Confidence Engine',
    script: 'dist/tests/step4.test.js',
    expectedExitCode: 0
  },
  {
    name: 'Context Compiler & LLM Interface (Offline Fallback)',
    script: 'dist/tests/step5.test.js',
    expectedExitCode: 0
  },
  {
    name: 'Compiler Swapping & Pronoun Resolution',
    script: 'dist/tests/step6.test.js',
    expectedExitCode: 0
  }
];

async function runTest(test: TestSpec): Promise<boolean> {
  console.log(`\n[RUN] ${test.name}...`);
  if (test.setup) {
    await test.setup();
  }

  return new Promise((resolve) => {
    const child = spawn('node', [test.script], {
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const exitCode = code ?? 0;
      const codeMatches = exitCode === test.expectedExitCode;
      const outputMatches = test.verifyOutput ? test.verifyOutput(stdout, stderr) : true;
      const passed = codeMatches && outputMatches;

      if (passed) {
        console.log(`\x1b[32m[PASS]\x1b[0m ${test.name}`);
        resolve(true);
      } else {
        console.log(`\x1b[31m[FAIL]\x1b[0m ${test.name}`);
        console.log(`  - Expected Exit Code: ${test.expectedExitCode}, Got: ${exitCode}`);
        if (test.verifyOutput && !outputMatches) {
          console.log(`  - Output verification failed.`);
        }
        console.log(`\n--- STDOUT ---\n${stdout}`);
        console.log(`\n--- STDERR ---\n${stderr}`);
        resolve(false);
      }
    });
  });
}

async function main() {
  console.log('==================================================');
  console.log('             LARS Test Suite Runner               ');
  console.log('==================================================');

  let passedAll = true;
  for (const test of tests) {
    const success = await runTest(test);
    if (!success) {
      passedAll = false;
    }
  }

  console.log('\n==================================================');
  if (passedAll) {
    console.log('\x1b[32m\x1b[1mALL TESTS PASSED SUCCESSFULLY!\x1b[0m');
    process.exit(0);
  } else {
    console.log('\x1b[31m\x1b[1mSOME TESTS FAILED!\x1b[0m');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner encountered an error:', err);
  process.exit(1);
});
