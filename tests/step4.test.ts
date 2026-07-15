import * as fs from 'fs';
import * as path from 'path';
import { ProgressiveTaskPlanner } from '../src/scheduler/planner';
import { DynamicConfidenceSchedulerEngine } from '../src/scheduler/engine';
import { ConfigurationService } from '../src/config';

async function runStep4Test() {
  console.log(`=== STARTING LARS STEP 4 CONFIGURABLE SCHEDULER TEST ===\n`);

  // Ensure staging area exists for local file presence checks
  const stagingDir = path.join(process.cwd(), '.lars', 'staging');
  fs.mkdirSync(stagingDir, { recursive: true });

  // Create temporary mock files to evaluate existence weight checks
  const billingFile = path.join(stagingDir, 'billing.ts');
  const indexFile = path.join(stagingDir, 'index.ts');
  const unsupportedFile = path.join(stagingDir, 'legacy.cpp');
  
  fs.writeFileSync(billingFile, 'export const CalculateFee = () => 10;');
  fs.writeFileSync(indexFile, 'export * from "./billing";');
  fs.writeFileSync(unsupportedFile, '#include <iostream>');

  const planner = new ProgressiveTaskPlanner();
  const engine = new DynamicConfidenceSchedulerEngine();

  // Test prompts representing different levels of intent & complexity
  const testScenarios = [
    {
      name: "Scenario 1: Simple Deterministic Task (File Exists)",
      prompt: `format .lars/staging/billing.ts`
    },
    {
      name: "Scenario 2: Simple Deterministic Task (File Does NOT Exist)",
      prompt: `format .lars/staging/nonexistent.ts`
    },
    {
      name: "Scenario 3: Symbol Rename on Shared Module (Low Isolation)",
      prompt: `rename calculateTax to computeTax in .lars/staging/index.ts`
    },
    {
      name: "Scenario 4: Symbol Rename on Unsupported Extension (C++)",
      prompt: `rename runCalc to runCalculate in .lars/staging/legacy.cpp`
    },
    {
      name: "Scenario 5: Multi-Step Compound Command (Decomposition check)",
      prompt: `rename CalculateFee to ComputeFee in .lars/staging/billing.ts then format .lars/staging/billing.ts && build`
    },
    {
      name: "Scenario 6: Complex Conceptual Request (Direct Fallback)",
      prompt: `Explain the system architectural boundary rules and how SQLite caches indexes.`
    }
  ];

  for (const scenario of testScenarios) {
    console.log(`======================================================================`);
    console.log(`[EXEC] ${scenario.name}`);
    console.log(`Input Prompt: "${scenario.prompt}"\n`);

    // 1. Generate plan
    const tasks = planner.plan(scenario.prompt);
    console.log(`Decomposed into ${tasks.length} task(s):`);

    // 2. Evaluate each step via the scheduler engine
    for (const task of tasks) {
      console.log(`  - Task #${task.sequence}: ${task.description}`);
      console.log(`    Parsed Intent: ${task.intent}`);
      
      const routing = engine.route(task);
      console.log(`    Confidence Score (C): ${routing.confidence} (Threshold: ${routing.threshold})`);
      console.log(`    Routed Decision:      ${routing.routedIntent}`);
      console.log(`    Routing Reason:       ${routing.reason}`);
      console.log();
      
      // Progress the state machine
      planner.updateTaskStatus(task.sequence, 'COMPLETED');
    }
  }

  // Cleanup temporary mock files
  try {
    fs.unlinkSync(billingFile);
    fs.unlinkSync(indexFile);
    fs.unlinkSync(unsupportedFile);
  } catch (err) {
    // Ignore cleanup errors
  }

  console.log(`======================================================================`);
  console.log(`=== STEP 4 TESTING COMPLETE ===`);
}

runStep4Test().catch(console.error);
