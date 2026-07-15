import * as fs from 'fs';
import * as path from 'path';

export interface JournalState {
  lastIntent: string;
  activeModule: string;
  buildHealthy: boolean;
  compressedSummary: string;
}

/**
 * JournalService implements ultra-lightweight, in-context state tracking.
 * Adheres strictly to the <2KB footprint constraint and uses atomic file swaps.
 */
export class JournalService {
  private static journalPath = path.resolve(process.cwd(), '.lars', 'lars.journal');

  /**
   * Synchronously hydrates the tiny state file into memory on startup.
   * Time Complexity: O(1) reads a single small file.
   * Space Complexity: O(1) memory footprint < 1 KB.
   */
  public static hydrateContext(): JournalState {
    try {
      if (fs.existsSync(this.journalPath)) {
        return JSON.parse(fs.readFileSync(this.journalPath, 'utf8'));
      }
    } catch {}
    return { lastIntent: 'NONE', activeModule: '', buildHealthy: true, compressedSummary: 'Cold Boot' };
  }

  /**
   * Overwrites the journal state using atomic file swapping to prevent data corruption.
   */
  public static compressState(intent: string, file: string, success: boolean, summary: string): void {
    const state: JournalState = {
      lastIntent: intent,
      activeModule: file,
      buildHealthy: success,
      compressedSummary: summary.substring(0, 99)
    };
    
    const dir = path.dirname(this.journalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = this.journalPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tempPath, this.journalPath); // Atomic OS-level swap
  }

  /**
   * Translates current journal metadata into a single-line prompt header.
   */
  public static compileHydratedPrompt(userPrompt: string): string {
    const state = this.hydrateContext();
    const header = `[LARS Journal Context: LastIntent=${state.lastIntent}, ActiveModule=${state.activeModule}, BuildHealthy=${state.buildHealthy}, StateSummary="${state.compressedSummary}"]`;
    return `${header} ${userPrompt}`;
  }
}
