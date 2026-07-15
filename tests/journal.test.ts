import * as fs from 'fs';
import * as path from 'path';
import { JournalService, JournalState } from '../src/core/memory/journal';
import { MinimalSymbolDatabase } from '../src/graph/db';
import { execSync } from 'child_process';

async function runJournalTest() {
  console.log(`=== STARTING LARS COMPRESSED VOLATILE JOURNAL TEST ===\n`);

  const larsDir = path.resolve(process.cwd(), '.lars');
  const journalPath = path.resolve(larsDir, 'lars.journal');

  // Ensure config directory exists
  if (!fs.existsSync(larsDir)) {
    fs.mkdirSync(larsDir, { recursive: true });
  }

  // 1. Write a mock dirty journal state directly
  console.log(`[1/4] Writing mock dirty state into .lars/lars.journal...`);
  const mockState: JournalState = {
    lastIntent: 'RENAME_SYMBOL',
    activeModule: 'src/math.ts',
    buildHealthy: false,
    compressedSummary: 'Renamed multiply to product; compile syntax check failed.'
  };
  fs.writeFileSync(journalPath, JSON.stringify(mockState, null, 2), 'utf8');
  console.log(`Journal successfully provisioned (${fs.statSync(journalPath).size} bytes).\n`);

  // 2. Test context hydration
  console.log(`[2/4] Loading context via hydrateContext()...`);
  const startHydrate = performance.now();
  const hydrated = JournalService.hydrateContext();
  const endHydrate = performance.now();
  
  console.log(`Hydrated State:`);
  console.log(`  - Last Intent:   ${hydrated.lastIntent}`);
  console.log(`  - Active Module: ${hydrated.activeModule}`);
  console.log(`  - Build Healthy: ${hydrated.buildHealthy}`);
  console.log(`  - Summary:       ${hydrated.compressedSummary}`);
  console.log(`Hydration Execution Latency: ${(endHydrate - startHydrate).toFixed(4)} ms\n`);

  // 3. Test prompt packing/compiling
  console.log(`[3/4] Running compileHydratedPrompt()...`);
  const query = "Explain why the compiler is crashing?";
  const packedPrompt = JournalService.compileHydratedPrompt(query);
  console.log(`\n--- PACKED STREAM PROMPT PREPENDED TO LLM ---`);
  console.log(packedPrompt);
  console.log(`---------------------------------------------\n`);

  // 4. Benchmark Incremental vs Full Sweeps
  console.log(`[4/4] Benchmarking full directory scan vs. optimized quick scan...`);
  
  // Ensure target active file exists
  const mathFile = path.resolve(process.cwd(), 'src', 'math.ts');
  if (!fs.existsSync(mathFile)) {
    fs.mkdirSync(path.dirname(mathFile), { recursive: true });
    fs.writeFileSync(mathFile, 'export function add(a: number, b: number) { return a+b; }');
  }

  // Measure Full Sweep
  const startFull = performance.now();
  // Call full scan
  execSync('node dist/src/index.js scan');
  const endFull = performance.now();
  const fullDuration = endFull - startFull;
  console.log(`Full Scan CLI Execution Duration: ${fullDuration.toFixed(2)} ms`);

  // Measure Quick Sweep (Bypassing crawler directory traversal)
  const startQuick = performance.now();
  execSync('node dist/src/index.js scan --quick');
  const endQuick = performance.now();
  const quickDuration = endQuick - startQuick;
  console.log(`Quick Scan CLI (Cache-Optimized) Execution Duration: ${quickDuration.toFixed(2)} ms`);

  const speedup = (fullDuration / quickDuration).toFixed(2);
  console.log(`Incremental Sweep Speedup Factor: ${speedup}x\n`);

  console.log(`=== JOURNAL TESTING COMPLETE ===`);
}

runJournalTest().catch(console.error);
