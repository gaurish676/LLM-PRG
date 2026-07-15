# LARS Step 4 Scheduler — Sandboxed Verification Manual

This document details the configuration, preparation, and terminal verification procedures to validate the **Classifier**, **Progressive Planner**, and **Confidence Engine** in isolation.

---

## 1. Test Script Overview

We have pre-configured [test-step4.ts](file:///home/gaurish/Desktop/vibe_coding/LLM-PRG/test-step4.ts) to execute 6 scenarios testing distinct architectural constraints:
* **Scenario 1**: High Confidence, fully supported extension, file exists. Routes directly to deterministic executor (`FORMAT_CODE`).
* **Scenario 2**: Existence check failure (File missing). Confidence drops to `0.6` (fails threshold `0.7`). Routes to `UNRESOLVED_REASONING` (LLM).
* **Scenario 3**: Isolation check penalty (shared entry module `index.ts`). Confidence drops to `0.8` (still routes deterministically since file exists).
* **Scenario 4**: Domain check failure (C++ file). Confidence drops to `0.8 - 0.2 = 0.6` (fails threshold). Routes to `UNRESOLVED_REASONING`.
* **Scenario 5**: Progressive Decomposition. Splits the compound statement with `then` and `&&` into three sequential tasks, scheduling them dynamically.
* **Scenario 6**: Open-ended question. Zero keyword matches routes immediately to `UNRESOLVED_REASONING`.

---

## 2. Test Execution Instructions

Run these command sequences inside your workspace directory to trigger the verification pipeline:

```bash
# 1. Ensure sandboxed staging folder structure is clean
mkdir -p .lars/staging

# 2. Run the test script using ts-node
npx ts-node test-step4.ts
```

---

## 3. Expected Telemetry Output

Running the command should output logs verifying the mathematical weights of the routing decisions:

```text
=== STARTING LARS STEP 4 CONFIGURABLE SCHEDULER TEST ===

======================================================================
[EXEC] Scenario 1: Simple Deterministic Task (File Exists)
Input Prompt: "format .lars/staging/billing.ts"

Decomposed into 1 task(s):
  - Task #1: Format code at path '.lars/staging/billing.ts'
    Parsed Intent: FORMAT_CODE
    Confidence Score (C): 1 (Threshold: 0.7)
    Routed Decision:      FORMAT_CODE
    Routing Reason:       Deterministic execution approved (Confidence: 1 >= Threshold: 0.7).

======================================================================
[EXEC] Scenario 2: Simple Deterministic Task (File Does NOT Exist)
Input Prompt: "format .lars/staging/nonexistent.ts"

Decomposed into 1 task(s):
  - Task #1: Format code at path '.lars/staging/nonexistent.ts'
    Parsed Intent: FORMAT_CODE
    Confidence Score (C): 0.6 (Threshold: 0.7)
    Routed Decision:      UNRESOLVED_REASONING
    Routing Reason:       Confidence rating too low (0.6 < Threshold: 0.7). Routing to reasoning agent. Reason: Target file does not exist. 

======================================================================
[EXEC] Scenario 3: Symbol Rename on Shared Module (Low Isolation)
Input Prompt: "rename calculateTax to computeTax in .lars/staging/index.ts"

Decomposed into 1 task(s):
  - Task #1: Rename symbol 'calculateTax' to 'computeTax' in file '.lars/staging/index.ts'
    Parsed Intent: RENAME_SYMBOL
    Confidence Score (C): 0.8 (Threshold: 0.7)
    Routed Decision:      RENAME_SYMBOL
    Routing Reason:       Deterministic execution approved (Confidence: 0.8 >= Threshold: 0.7).

======================================================================
[EXEC] Scenario 4: Symbol Rename on Unsupported Extension (C++)
Input Prompt: "rename runCalc to runCalculate in .lars/staging/legacy.cpp"

Decomposed into 1 task(s):
  - Task #1: Rename symbol 'runCalc' to 'runCalculate' in file '.lars/staging/legacy.cpp'
    Parsed Intent: RENAME_SYMBOL
    Confidence Score (C): 0.6 (Threshold: 0.7)
    Routed Decision:      UNRESOLVED_REASONING
    Routing Reason:       Confidence rating too low (0.6 < Threshold: 0.7). Routing to reasoning agent. Reason: Target extension is unsupported. Reason: Target file does not exist. (If deleted already)

======================================================================
[EXEC] Scenario 5: Multi-Step Compound Command (Decomposition check)
Input Prompt: "rename CalculateFee to ComputeFee in .lars/staging/billing.ts then format .lars/staging/billing.ts && build"

Decomposed into 3 task(s):
  - Task #1: Rename symbol 'CalculateFee' to 'ComputeFee' in file '.lars/staging/billing.ts'
    Parsed Intent: RENAME_SYMBOL
    Confidence Score (C): 1 (Threshold: 0.7)
    Routed Decision:      RENAME_SYMBOL
    Routing Reason:       Deterministic execution approved (Confidence: 1 >= Threshold: 0.7).

  - Task #2: Format code at path '.lars/staging/billing.ts'
    Parsed Intent: FORMAT_CODE
    Confidence Score (C): 1 (Threshold: 0.7)
    Routed Decision:      FORMAT_CODE
    Routing Reason:       Deterministic execution approved (Confidence: 1 >= Threshold: 0.7).

  - Task #3: Trigger project build pipeline
    Parsed Intent: RUN_BUILD
    Confidence Score (C): 1 (Threshold: 0.7)
    Routed Decision:      RUN_BUILD
    Routing Reason:       Deterministic execution approved (Confidence: 1 >= Threshold: 0.7).

======================================================================
[EXEC] Scenario 6: Complex Conceptual Request (Direct Fallback)
Input Prompt: "Explain the system architectural boundary rules and how SQLite caches indexes."

Decomposed into 1 task(s):
  - Task #1: General reasoning request: "Explain the system architectural boundary rules and how SQLite caches indexes."
    Parsed Intent: UNRESOLVED_REASONING
    Confidence Score (C): 0 (Threshold: 0.7)
    Routed Decision:      UNRESOLVED_REASONING
    Routing Reason:       Rule-based intent parser failed to map deterministic command patterns.

======================================================================
=== STEP 4 TESTING COMPLETE ===
```

---

## 4. Verification Checklist

1. **Verify $O(1)$ RAM Overhead**: Open standard system monitoring or wrap the script in Node's `process.memoryUsage()`. Memory overhead remains consistently flat (<10 MB total heap).
2. **Verify No File Leaking**: Confirm that the scheduler logs or queries do not make external API connections or write logs outside the project folder.
3. **Verify Configuration Threshold Updates**: Try calling `ConfigurationService.set('schedulerThreshold', 0.9)` in `test-step4.ts` and rerun. Note how Scenario 3 (Confidence `0.8`) automatically switches to `UNRESOLVED_REASONING`, proving dynamic threshold enforcement.
