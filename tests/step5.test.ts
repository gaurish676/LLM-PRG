import * as fs from 'fs';
import * as path from 'path';
import { MinimalSymbolDatabase } from '../src/graph/db';
import { StructuralContextCompiler } from '../src/scheduler/preprocessor';
import { UniversalLLMClient } from '../src/ollama/client';

async function runStep5Test() {
  console.log(`=== STARTING LARS STEP 5 CONTEXT COMPILER & LLM CLIENT TEST ===\n`);

  // 1. Setup mock workspace files in .lars/staging/
  const stagingDir = path.join(process.cwd(), '.lars', 'staging');
  fs.mkdirSync(stagingDir, { recursive: true });

  const billingPath = path.join(stagingDir, 'billing.ts');
  const helperPath = path.join(stagingDir, 'helpers.ts');

  // Write some mock code elements with class and function structures
  fs.writeFileSync(billingPath, `
    export interface Invoice {
      id: string;
      total: number;
    }
    
    export class BillingManager {
      calculateTotal(items: any[]): number {
        return items.reduce((sum, item) => sum + item.price, 0);
      }
    }
  `);

  fs.writeFileSync(helperPath, `
    export function formatCurrency(value: number): string {
      return "$" + value.toFixed(2);
    }
    
    const API_KEY = "mock_key";
  `);

  console.log(`[1/3] Indexing mock files in database...`);
  MinimalSymbolDatabase.indexWorkspace([billingPath, helperPath]);
  
  const cachedSymbols = MinimalSymbolDatabase.getAllSymbols();
  console.log(`Cached symbols registry count: ${cachedSymbols.length}`);
  for (const sym of cachedSymbols) {
    console.log(`  - [${sym.type}] ${sym.name} in ${path.basename(sym.filePath)}`);
  }
  console.log();

  // 2. Test prompt context compiling
  console.log(`[2/3] Compiling prompt context for search: "Explain how BillingManager interface matches formatCurrency?"`);
  const query = "Explain how BillingManager class matches formatCurrency?";
  const compilation = StructuralContextCompiler.compile(query);

  console.log(`\n--- COMPILED PROMPT SENT TO LOCAL LLM ---`);
  console.log(compilation.prompt);
  console.log(`-----------------------------------------\n`);
  console.log(`Injected files/symbols list:`, compilation.injectedSymbols);
  console.log();

  // 3. Test LLM client with local presence detection
  console.log(`[3/3] Testing UniversalLLMClient local availability...`);
  
  const client = new UniversalLLMClient({
    endpoint: "http://localhost:11434",
    model: "qwen2.5-coder:1.5b",
    provider: "ollama"
  });

  const models = await client.getAvailableModels();
  if (models.length === 0) {
    console.log(`  [INFO] Local Ollama service is offline or not installed. Verification complete (Offline fallback triggered).`);
  } else {
    console.log(`  [INFO] Local Ollama service is online! Available models:`, models);
    console.log(`  [STREAM] Sending compiled query to first model...`);
    
    const chosenModel = models.includes("qwen2.5-coder:1.5b") ? "qwen2.5-coder:1.5b" : models[0];
    const liveClient = new UniversalLLMClient({
      endpoint: "http://localhost:11434",
      model: chosenModel,
      provider: "ollama"
    });

    console.log(`Using model: ${chosenModel}`);
    process.stdout.write(`Stream Output: `);
    
    try {
      await liveClient.generateStream(
        compilation.prompt,
        (chunk) => {
          process.stdout.write(chunk);
        },
        (complete) => {
          console.log(`\n\n[COMPLETE] Response characters: ${complete.length}`);
        }
      );
    } catch (err: any) {
      console.log(`\n  [ERROR] Streaming failed:`, err.message);
    }
  }

  // Cleanup staging files
  try {
    fs.unlinkSync(billingPath);
    fs.unlinkSync(helperPath);
  } catch {}

  console.log(`\n=== STEP 5 TESTING COMPLETE ===`);
}

runStep5Test().catch(console.error);
