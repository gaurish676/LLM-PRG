import { TaskIntent } from './classifier';
import { COLORS } from '../cli/tui';

export enum AgentType {
  ORCHESTRATOR = 'ORCHESTRATOR',
  CODING_AGENT = 'CODING_AGENT',
  REASONING_AGENT = 'REASONING_AGENT',
  DEBUGGING_AGENT = 'DEBUGGING_AGENT',
  TESTING_AGENT = 'TESTING_AGENT',
  CRUD_AGENT = 'CRUD_AGENT'
}

export interface AgentDefinition {
  type: AgentType;
  name: string;
  role: string;
  color: string;
  description: string;
}

export const AGENT_REGISTRY: Record<AgentType, AgentDefinition> = {
  [AgentType.ORCHESTRATOR]: {
    type: AgentType.ORCHESTRATOR,
    name: 'LARS',
    role: 'Orchestration Router',
    color: COLORS.cyan,
    description: 'Intercepts commands, structures task sequences, and delegates work to specialist agents.'
  },
  [AgentType.CODING_AGENT]: {
    type: AgentType.CODING_AGENT,
    name: 'CoderAgent',
    role: 'Software Engineer',
    color: COLORS.brightBlue,
    description: 'Writes, formats, refactors, and edits codebase code across multiple programming languages.'
  },
  [AgentType.REASONING_AGENT]: {
    type: AgentType.REASONING_AGENT,
    name: 'PhilosopherAgent',
    role: 'System Architect',
    color: COLORS.magenta,
    description: 'Explains complex logic, performs code analysis, and answers conceptual queries.'
  },
  [AgentType.DEBUGGING_AGENT]: {
    type: AgentType.DEBUGGING_AGENT,
    name: 'DebuggerAgent',
    role: 'Reliability Engineer',
    color: COLORS.red,
    description: 'Executes builds, scans error logs, resolves compiler issues, and suggests self-corrections.'
  },
  [AgentType.TESTING_AGENT]: {
    type: AgentType.TESTING_AGENT,
    name: 'QA_Agent',
    role: 'Quality Assurance',
    color: COLORS.green,
    description: 'Runs test suites, evaluates test failures, and asserts application correctness.'
  },
  [AgentType.CRUD_AGENT]: {
    type: AgentType.CRUD_AGENT,
    name: 'CrudAgent',
    role: 'Data Operator',
    color: COLORS.yellow,
    description: 'Executes file operations (create, read, update, delete) under strict user permission gating.'
  }
};

/**
 * Returns the best agent to handle a specific TaskIntent and prompt.
 */
export function getAgentForIntent(intent: TaskIntent, prompt: string): AgentDefinition {
  // If unresolved reasoning, inspect query content to route to the correct agent
  if (intent === TaskIntent.UNRESOLVED_REASONING) {
    const lower = prompt.toLowerCase();
    
    // Debugging signatures
    if (lower.includes('fix') || lower.includes('error') || lower.includes('debug') || lower.includes('fail') || lower.includes('compile') || lower.includes('crash')) {
      return AGENT_REGISTRY[AgentType.DEBUGGING_AGENT];
    }
    
    // Coding signatures
    if (lower.includes('write') || lower.includes('create') || lower.includes('add') || lower.includes('generate') || lower.includes('implement') || lower.includes('refactor') || lower.includes('function') || lower.includes('class')) {
      return AGENT_REGISTRY[AgentType.CODING_AGENT];
    }
    
    // Testing signatures
    if (lower.includes('test') || lower.includes('suite') || lower.includes('spec') || lower.includes('assert')) {
      return AGENT_REGISTRY[AgentType.TESTING_AGENT];
    }

    // Default general reasoning
    return AGENT_REGISTRY[AgentType.REASONING_AGENT];
  }

  // Explicit mappings
  switch (intent) {
    case TaskIntent.RENAME_SYMBOL:
    case TaskIntent.FORMAT_CODE:
      return AGENT_REGISTRY[AgentType.CODING_AGENT];
      
    case TaskIntent.MOVE_FILE:
    case TaskIntent.GIT_STATUS:
    case TaskIntent.GIT_DIFF:
    case TaskIntent.COPY_FILES:
    case TaskIntent.CLEAR_FILES:
      return AGENT_REGISTRY[AgentType.CRUD_AGENT];
      
    case TaskIntent.RUN_BUILD:
    case TaskIntent.RUN_LINT:
      return AGENT_REGISTRY[AgentType.DEBUGGING_AGENT];
      
    case TaskIntent.RUN_TEST:
      return AGENT_REGISTRY[AgentType.TESTING_AGENT];

    default:
      return AGENT_REGISTRY[AgentType.REASONING_AGENT];
  }
}

/**
 * Returns specialized system prompts that shape the persona of the single Qwen model.
 * Saves RAM by running the same local weights but with varying prompt instruction parameters.
 */
export function getPersonaPrompt(agentType: AgentType, basePrompt: string): string {
  const formattingDirective = 
    "FORMATTING RULES:\n" +
    "- Be extremely concise, direct, and factual.\n" +
    "- Avoid conversational filler, intros, and outros (do NOT start with 'Certainly! Here is...' or end with 'In conclusion...').\n" +
    "- Use clean, structured Markdown: ### headers, bold bullet points, and code blocks.\n" +
    "- Avoid long paragraphs. Prefer bullet points with bold keywords.";

  const instructions: Record<AgentType, string> = {
    [AgentType.ORCHESTRATOR]: 'You are LARS, the Orchestration Router. Coordinate the task flow.',
    [AgentType.CODING_AGENT]: 'You are CoderAgent, a senior software engineer. Write clean, optimal, sandboxed code.',
    [AgentType.REASONING_AGENT]: 'You are PhilosopherAgent, a system architect. Provide high-level conceptual explanations, algorithm design, and structure advice.',
    [AgentType.DEBUGGING_AGENT]: 'You are DebuggerAgent, a reliability engineer. Focus on diagnosing compiler and syntax errors.',
    [AgentType.TESTING_AGENT]: 'You are QA_Agent, a quality assurance tester. Analyze test suites and verify assertions.',
    [AgentType.CRUD_AGENT]: 'You are CrudAgent, a data operator. Guide secure filesystem operations.'
  };

  const instruction = instructions[agentType] || instructions[AgentType.REASONING_AGENT];
  return `[SYSTEM INSTRUCTION: ${instruction}]\n[${formattingDirective}]\n\n${basePrompt}`;
}
