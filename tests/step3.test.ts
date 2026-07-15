import * as fs from 'fs';
import { walkDirectory } from '../src/scanner/walker';
import { StreamingLexicalBroker } from '../src/scanner/lexer';
import { join } from 'path';

async function runTest() {
  const stagingPath = join(process.cwd(), '.lars', 'staging');
  
  console.log(`=== STARTING LARS STEP 3 COMPONENT TEST ===`);
  console.log(`Target Staging Sandbox: ${stagingPath}\n`);

  if (!fs.existsSync(stagingPath)) {
    console.error(`Staging directory does not exist! Please build the mock directory structure first.`);
    process.exit(1);
  }

  // 1. Run Directory Tree Walker
  console.log(`[1/2] Crawling staging directory lazily...`);
  const files: string[] = [];
  
  // Feed options to ignores and extensions
  const options = {
    ignoreDirs: new Set(['node_modules', '.git', 'dist', '.lars_ignored']),
    allowedExtensions: new Set(['.ts', '.js', '.json', '.txt'])
  };

  for await (const filePath of walkDirectory(stagingPath, stagingPath, options)) {
    console.log(`  -> Found file: ${filePath}`);
    files.push(filePath);
  }
  console.log(`Total files found: ${files.length}\n`);

  // 2. Feed files into Lexical Broker using streaming streams
  console.log(`[2/2] Running StreamingLexicalBroker stream validation...`);
  
  for (const file of files) {
    console.log(`----------------------------------------`);
    console.log(`Processing: ${file}`);
    
    const broker = new StreamingLexicalBroker();
    
    // Read the file in small chunks (mocking TCP stream chunks)
    const stream = fs.createReadStream(file, { highWaterMark: 16, encoding: 'utf8' });
    
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk) => {
        broker.write(chunk as string);
      });
      stream.on('end', () => {
        resolve();
      });
      stream.on('error', (err) => {
        reject(err);
      });
    });

    const result = broker.finalize();
    console.log(`  - Balanced: ${result.balanced}`);
    console.log(`  - Total Anomalies: ${result.anomalies}`);
    
    if (result.repairs.length > 0) {
      console.log(`  - Repair Log:`);
      for (const rep of result.repairs) {
        console.log(`    [L${rep.line}:C${rep.column}] [${rep.type.toUpperCase()}] ${rep.description}`);
      }
    }
    if (result.autoFixString.length > 0) {
      console.log(`  - Append completion string: "${result.autoFixString}"`);
    }
  }
  console.log(`\n=== STEP 3 TESTING COMPLETE ===`);
}

runTest().catch((err) => {
  console.error(`Unhandled test rejection:`, err);
});
