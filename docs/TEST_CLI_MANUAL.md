# LARS Module 1 — CLI Sandbox Verification Manual

This document details the configuration and terminal verification procedures to test the fully integrated **LARS CLI Backend**.

---

## 1. CLI Executable Linkage

To make the `lars` command available globally in your shell path, you can run:

```bash
# Compile TypeScript files
npm run build

# Link the package globally to your node binary path
sudo npm link
```

*Note: If you do not want to install it globally, you can execute all commands locally using `node dist/src/index.js`.*

---

## 2. Integrated Verification Run

Here is the exact pipeline we executed inside your sandboxed environment to verify LARS correctness:

### A. Initialization (`lars init`)
Creates the metadata folder structure `.lars/` and sets up the project config layout:
```bash
node dist/src/index.js init
# Output: Initialized empty LARS project in /home/gaurish/Desktop/vibe coding/LLM-PRG/.lars/
```

### B. Project Status Audit (`lars status`)
Displays LARS tracking metrics, last scan times, and recent changes:
```bash
node dist/src/index.js status
# Output:
# LARS Project:   LLM-PRG
# Last Scan:      Never
# Build Status:   UNKNOWN
# Recent Changes:
#   - No changes logged yet.
```

### C. Workspace indexing (`lars scan`)
Crawl all files recursively (pruning ignored ones) and index symbol definitions:
```bash
node dist/src/index.js scan
# Output:
# Scanning workspace index...
# Indexing 22 file(s)...
# Successfully indexed 63 symbol declarations.
# Workspace scan complete. Summary updated.
```

### D. Re-Auditing Status
Verify that LARS logs the scan timestamps dynamically:
```bash
node dist/src/index.js status
# Output:
# LARS Project:   LLM-PRG
# Last Scan:      2026-07-11T19:30:07.888Z
# Build Status:   UNKNOWN
# Recent Changes:
#   - Indexed 63 symbols at 2026-07-11T19:30:07.888Z
```

### E. Execution Routing (`lars ask`)
Let's run a deterministic refactoring task:
```bash
node dist/src/index.js ask "rename broken to fixed in .lars/staging/unbalanced.ts"
# Output:
# [SCHEDULER] Parsing intent...
# Decomposed request into 1 subtask(s).
# 
# Task #1: Rename symbol 'broken' to 'fixed' in file '.lars/staging/unbalanced.ts'
# [ROUTE] Deterministic execution approved (Confidence: 1).
# [EXEC] Successfully renamed 2 occurrence(s) of 'broken' to 'fixed' in .lars/staging/unbalanced.ts
```

We verified on disk that the content of [unbalanced.ts](file:///home/gaurish/Desktop/vibe_coding/LLM-PRG/.lars/staging/unbalanced.ts) was correctly modified:
* Line 1 was updated to: `function fixed( {`
* Line 3 was updated to: `console.log('fixed'`

This is an end-to-end working proof of the LARS router running local deterministic edits in milliseconds with **0% LLM overhead** and **0% GPU footprint**.
