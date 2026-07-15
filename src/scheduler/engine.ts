import * as fs from 'fs';
import { resolve } from 'path';
import { TaskIntent, ExtractedPayload } from './classifier';
import { DecomposedTask } from './planner';
import { ConfigurationService } from '../config';

export interface RoutingDecision {
  sequence: number;
  confidence: number;
  threshold: number;
  routedIntent: TaskIntent;
  isDeterministic: boolean;
  reason: string;
}

/**
 * DynamicConfidenceSchedulerEngine computes the capability confidence for each task.
 * 
 * Formula:
 *   Confidence (C) = (0.4 * Se) + (0.4 * Si) + (0.2 * Sd)
 * 
 *   Se (Existence Factor): 1.0 if target file exists, 0.0 otherwise.
 *   Si (Isolation Factor): 1.0 if single isolated target, 0.5 if shared layout module, 0.0 if cross-boundary.
 *   Sd (Domain Support Factor): 1.0 if target extension matches supported AST list, 0.0 otherwise.
 */
export class DynamicConfidenceSchedulerEngine {

  /**
   * Evaluates a decomposed task and produces a formal routing decision.
   */
  public route(task: DecomposedTask): RoutingDecision {
    const threshold = ConfigurationService.get<number>('schedulerThreshold', 0.7);

    // 1. Check for tasks classified as reasoning initially
    if (task.intent === TaskIntent.UNRESOLVED_REASONING) {
      return {
        sequence: task.sequence,
        confidence: 0.0,
        threshold,
        routedIntent: TaskIntent.UNRESOLVED_REASONING,
        isDeterministic: false,
        reason: 'Rule-based intent parser failed to map deterministic command patterns.'
      };
    }

    // 2. Perform component weight evaluation
    const Se = this.calculateExistenceFactor(task.payload, task.intent);
    const Si = this.calculateIsolationFactor(task.payload, task.intent);
    const Sd = this.calculateDomainFactor(task.payload, task.intent);

    const confidence = parseFloat(((0.4 * Se) + (0.4 * Si) + (0.2 * Sd)).toFixed(2));

    const isDeterministic = confidence >= threshold;
    const routedIntent = isDeterministic ? task.intent : TaskIntent.UNRESOLVED_REASONING;

    let reason = `Deterministic execution approved (Confidence: ${confidence} >= Threshold: ${threshold}).`;
    if (!isDeterministic) {
      reason = `Confidence rating too low (${confidence} < Threshold: ${threshold}). Routing to reasoning agent. `;
      if (Se === 0) reason += 'Reason: Target file does not exist. ';
      if (Sd === 0) reason += 'Reason: Target extension is unsupported. ';
      if (Si < 1.0) reason += 'Reason: Target has potential multi-file dependencies. ';
    }

    return {
      sequence: task.sequence,
      confidence,
      threshold,
      routedIntent,
      isDeterministic,
      reason
    };
  }

  private calculateExistenceFactor(payload: ExtractedPayload, intent: TaskIntent): number {
    // Tasks that don't depend on a file have a baseline existence of 1.0
    if (intent === TaskIntent.GIT_STATUS || intent === TaskIntent.GIT_DIFF || intent === TaskIntent.RUN_BUILD || intent === TaskIntent.CREATE_FILE) {
      return 1.0;
    }

    const filePath = payload.filePath || payload.sourcePath || payload.target;
    if (!filePath) return 0.0;

    try {
      // Resolve path within active workspace sandbox
      const resolved = resolve(process.cwd(), filePath);
      if (fs.existsSync(resolved)) {
        return 1.0;
      }
    } catch {
      return 0.0;
    }

    return 0.0;
  }

  private calculateIsolationFactor(payload: ExtractedPayload, intent: TaskIntent): number {
    // Structural modifications to key shared symbols lower isolation confidence
    const filePath = payload.filePath || payload.sourcePath || payload.target;
    if (!filePath) return 1.0;

    const baseName = filePath.split(/[\\/]/).pop() || '';
    
    // Core structural file names lower isolation score due to high dependency density
    const sharedModulePatterns = ['index.ts', 'index.js', 'types.ts', 'constants.ts', 'main.ts'];
    if (sharedModulePatterns.includes(baseName.toLowerCase())) {
      return 0.5;
    }

    // Single-file specific modification is isolated
    return 1.0;
  }

  private calculateDomainFactor(payload: ExtractedPayload, intent: TaskIntent): number {
    // Non-file commands or generic filesystem actions are always compatible
    if (
      intent === TaskIntent.GIT_STATUS ||
      intent === TaskIntent.GIT_DIFF ||
      intent === TaskIntent.RUN_BUILD ||
      intent === TaskIntent.COPY_FILES ||
      intent === TaskIntent.CLEAR_FILES
    ) {
      return 1.0;
    }

    const filePath = payload.filePath || payload.sourcePath || payload.target;
    if (!filePath) return 0.0;

    const dotIdx = filePath.lastIndexOf('.');
    const ext = dotIdx !== -1 ? filePath.substring(dotIdx) : '';

    const allowedExtensions = ConfigurationService.get<Set<string>>(
      'allowedExtensions',
      new Set(['.ts', '.js', '.tsx', '.jsx', '.json'])
    );

    return allowedExtensions.has(ext) ? 1.0 : 0.0;
  }
}
