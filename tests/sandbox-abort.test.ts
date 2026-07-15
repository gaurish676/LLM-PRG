import { ensureSandbox } from '../src/utils/sandbox';

console.log("=== STARTING SANDBOX ESCAPE TEST ===");
console.log("Attempting to query escaping path '../escaping_file.txt'...");

// This should cause an immediate kernel abort and process exit 1
ensureSandbox("../escaping_file.txt");

console.log("CRITICAL ERROR: This line should never be printed!");
