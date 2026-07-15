import { TaskIntent, StructuralRegexClassifier, ExtractedPayload } from './classifier';

export type TaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface DecomposedTask {
  sequence: number;
  intent: TaskIntent;
  targetPath: string;
  payload: ExtractedPayload;
  status: TaskStatus;
  description: string;
}

/**
 * ProgressiveTaskPlanner splits compound requests and structures them as sequential nodes.
 * This guarantees linear O(K) complexity where K is the number of sequential instructions.
 */
export class ProgressiveTaskPlanner {
  private taskQueue: DecomposedTask[] = [];
  private currentSequence = 0;

  /**
   * Decomposes a raw prompt into a sequence of execution nodes.
   */
  public plan(rawPrompt: string): DecomposedTask[] {
    this.taskQueue = [];
    this.currentSequence = 0;

    let processedPrompt = rawPrompt.trim();

    // 1. Swap segments if "but before that" is used
    const beforeThatRegex = /\s+but\s+before\s+that\s+/i;
    if (beforeThatRegex.test(processedPrompt)) {
      const parts = processedPrompt.split(beforeThatRegex);
      if (parts.length === 2) {
        processedPrompt = `${parts[1]} then ${parts[0]}`;
      }
    }

    // 2. Split compound statements (e.g., "rename X to Y in Z && run build; format Z")
    const segments = processedPrompt.split(/\s*(?:and\s+then|then|&&|;)\s*/i);
    
    // 3. Pronoun resolution between segments
    let resolvedSegments = segments.map(s => s.trim());
    let referencePath = '';
    for (const seg of resolvedSegments) {
      if (/\b(?:its\s+content|its|it)\b/i.test(seg)) continue;
      const tokens = seg.split(/\s+/);
      for (const token of tokens) {
        const cleanToken = token
          .replace(/\buser_io\b/g, 'users_io')
          .replace(/^(?:\.\/)?LLM-PRG\//, '')
          .trim();
        const pathCandidate = cleanToken.replace(/[,\.;]$/, '');
        if (pathCandidate.includes('/') || pathCandidate.includes('.')) {
          referencePath = pathCandidate;
          break;
        }
      }
      if (referencePath) break;
    }

    if (referencePath) {
      resolvedSegments = resolvedSegments.map(seg => {
        return seg.replace(/\bits\s+content\b|\bits\b|\bit\b/gi, referencePath);
      });
    }

    let seq = 1;
    for (const segment of resolvedSegments) {
      if (segment.length === 0) continue;

      const result = StructuralRegexClassifier.classify(segment);
      const targetPath = result.payload.filePath || result.payload.target || '';

      this.taskQueue.push({
        sequence: seq++,
        intent: result.intent,
        targetPath,
        payload: result.payload,
        status: 'PENDING',
        description: this.getTaskDescription(result.intent, result.payload, segment)
      });
    }

    return this.taskQueue;
  }

  /**
   * Retrieves the next pending task in the sequence.
   */
  public getNextTask(): DecomposedTask | null {
    for (const task of this.taskQueue) {
      if (task.status === 'PENDING') {
        return task;
      }
    }
    return null;
  }

  /**
   * Progresses the status of a specific task by sequence number.
   */
  public updateTaskStatus(sequence: number, status: TaskStatus): void {
    const task = this.taskQueue.find(t => t.sequence === sequence);
    if (task) {
      task.status = status;
    }
  }

  /**
   * Gets the list of all planned tasks.
   */
  public getTasks(): DecomposedTask[] {
    return [...this.taskQueue];
  }

  private getTaskDescription(intent: TaskIntent, payload: ExtractedPayload, raw: string): string {
    switch (intent) {
      case TaskIntent.RENAME_SYMBOL:
        return `Rename symbol '${payload.oldName}' to '${payload.newName}' in file '${payload.filePath}'`;
      case TaskIntent.MOVE_FILE:
        return `Move file from '${payload.sourcePath}' to '${payload.destPath}'`;
      case TaskIntent.CREATE_FILE:
        return `Create new file at '${payload.filePath}'`;
      case TaskIntent.DELETE_FILE:
        return `Delete file at '${payload.filePath}'`;
      case TaskIntent.FORMAT_CODE:
        return `Format code at path '${payload.target}'`;
      case TaskIntent.RUN_LINT:
        return `Lint code at path '${payload.target}'`;
      case TaskIntent.RUN_TEST:
        return `Run test suites matching '${payload.target || 'all'}'`;
      case TaskIntent.RUN_BUILD:
        return `Trigger project build pipeline`;
      case TaskIntent.GIT_STATUS:
        return `Check local repository dirty tree status`;
      case TaskIntent.GIT_DIFF:
        return `Retrieve workspace source modifications`;
      case TaskIntent.COPY_FILES:
        return `Copy files from '${payload.sourcePath}' to '${payload.destPath}'`;
      case TaskIntent.CLEAR_FILES:
        return `Clear all files in directory '${payload.filePath}'`;
      case TaskIntent.UNRESOLVED_REASONING:
        return `General reasoning request: "${raw}"`;
    }
  }
}
