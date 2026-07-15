# LARS Step 3 components — Zero-Execution Terminal Testing Manual

This manual provides detailed instructions to set up, run, and verify the directory tree walker and `StreamingLexicalBroker` under strict sandboxed environment conditions.

---

## 1. Test Environment Preparation

Follow these steps to safely initialize the virtual file staging area inside the project directory (`.lars/staging/`) without leaking any assets to parent directories. We will create three scenarios:
1. **`valid.ts`**: Perfectly balanced code constructs.
2. **`unbalanced.ts`**: Containing nested unmatched parentheses and brackets.
3. **`ignored_folder/`**: A mock folder structure that should be pruned at the walking boundary.

### Terminal Commands to Initialize Sandbox:
Execute the following commands in your shell within the workspace root:

```bash
# 1. Create directory structure
mkdir -p .lars/staging
mkdir -p .lars/staging/node_modules
mkdir -p .lars/staging/dist
mkdir -p .lars/staging/src/utils

# 2. Populate a valid code file (Perfect balance)
printf "function main() {\n  const x = [1, 2, 3];\n  console.log(\"Hello world\");\n}\n" > .lars/staging/valid.ts

# 3. Populate an unbalanced code file (Missing brackets/parentheses)
# Under L1: '{' is never closed
# Under L2: '[' is closed by ')'
printf "function broken( {\n  const arr = [1, 2, 3);\n  console.log('broken'\n" > .lars/staging/unbalanced.ts

# 4. Populate nested files in ignored boundaries (Should NOT be detected)
printf "console.log('should be ignored');\n" > .lars/staging/node_modules/leak.ts
printf "console.log('dist should be ignored');\n" > .lars/staging/dist/output.js
printf "{\n" > .lars/staging/src/utils/nested_balanced.ts
```

---

## 2. Test Execution

The test file `test-step3.ts` has been pre-configured in the project root. This script performs the following flow:
1. Triggers the lazy directory crawler (`walkDirectory`) over `.lars/staging/`.
2. Verifies that the ignore list (`node_modules`, `dist`, `.lars`) drops directories immediately at the path boundary.
3. Feeds discovered files piece-by-piece in 16-character buffers (simulating chunks streaming from a TCP socket) to verify state continuity.
4. Outputs real-time balance metrics, anomaly counts, detailed positional logs (Line/Column/Type), and auto-fix sequence recommendations.

### Commands to Run the Test:

Ensure dependencies (TypeScript, ts-node) are present. If not initialized, run:
```bash
npm init -y
npm install -D typescript ts-node @types/node
```

To execute the test suite:
```bash
npx ts-node test-step3.ts
```

---

## 3. Expected Telemetry Output

Running the command should yield terminal logs mirroring the following trace:

```text
=== STARTING LARS STEP 3 COMPONENT TEST ===
Target Staging Sandbox: /home/gaurish/Desktop/vibe coding/LLM-PRG/.lars/staging

[1/2] Crawling staging directory lazily...
  -> Found file: /home/gaurish/Desktop/vibe coding/LLM-PRG/.lars/staging/valid.ts
  -> Found file: /home/gaurish/Desktop/vibe coding/LLM-PRG/.lars/staging/unbalanced.ts
  -> Found file: /home/gaurish/Desktop/vibe coding/LLM-PRG/.lars/staging/src/utils/nested_balanced.ts
Total files found: 3

[2/2] Running StreamingLexicalBroker stream validation...
----------------------------------------
Processing: /home/gaurish/Desktop/vibe coding/LLM-PRG/.lars/staging/valid.ts
  - Balanced: true
  - Total Anomalies: 0
----------------------------------------
Processing: /home/gaurish/Desktop/vibe coding/LLM-PRG/.lars/staging/unbalanced.ts
  - Balanced: false
  - Total Anomalies: 3
  - Repair Log:
    [L2:C23] [INSERT] Mismatch: Expected ']' to close '[', but found ')'. Auto-inserting ']'.
    [L3:C23] [INSERT] Unterminated open '(' at EOF; auto-closing with ')'.
    [L3:C23] [INSERT] Unterminated open '{' at EOF; auto-closing with '}'.
  - Append completion string: ")}"
----------------------------------------
Processing: /home/gaurish/Desktop/vibe coding/LLM-PRG/.lars/staging/src/utils/nested_balanced.ts
  - Balanced: false
  - Total Anomalies: 1
  - Repair Log:
    [L2:C1] [INSERT] Unterminated open '{' at EOF; auto-closing with '}'.
  - Append completion string: "}"

=== STEP 3 TESTING COMPLETE ===
```

---

## 4. Verification Checkpoints

* **Containment Verification**: Notice that no paths outside `.lars/staging` are crawler-yielded. If you try to pass `../../` to the walker, it will block execution throwing the `Directory containment violation` error.
* **Pruning Verification**: Verify that `/node_modules/leak.ts` and `/dist/output.js` are absent from the scanner output trace, showing they were correctly pruned at the directory traversal boundary without read calls.
* **Lexer Boundary Verification**: Check that character strings inside comments or literal quotes are skipped by the parser and do not generate false mismatch anomalies.
