import { ProgressiveTaskPlanner } from '../src/scheduler/planner';
import { DynamicConfidenceSchedulerEngine } from '../src/scheduler/engine';

console.log("=== STARTING LARS COMPILER SWAPPING & PRONOUN RESOLUTION TEST ===");

const planner = new ProgressiveTaskPlanner();
const engine = new DynamicConfidenceSchedulerEngine();

const prompt = "clear all file in LLM-PRG/user_io/input/ but before that copy its content to LLM-PRG/user_io/output";
console.log(`\nInput Prompt: "${prompt}"`);

const tasks = planner.plan(prompt);

console.log(`\nDecomposed into ${tasks.length} task(s):`);
for (const task of tasks) {
  const decision = engine.route(task);
  console.log(`  - Task #${task.sequence}: ${task.description}`);
  console.log(`    Parsed Intent:     ${task.intent}`);
  console.log(`    Source Path:       ${task.payload.sourcePath || 'N/A'}`);
  console.log(`    Dest Path:         ${task.payload.destPath || 'N/A'}`);
  console.log(`    File Path:         ${task.payload.filePath || 'N/A'}`);
  console.log(`    Confidence Score:  ${decision.confidence}`);
  console.log(`    Is Deterministic:  ${decision.isDeterministic}`);
  console.log(`    Routed Decision:   ${decision.routedIntent}`);
  console.log("-----------------------------------------");
}

if (tasks.length === 2 && tasks[0].intent === 'COPY_FILES' && tasks[1].intent === 'CLEAR_FILES') {
  console.log("\n✅ SUCCESS: Swapping and pronoun resolution tests passed!");
} else {
  console.log("\n❌ FAIL: Swapping or pronoun resolution incorrect.");
  process.exit(1);
}
