# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-16

This is the initial production release of LARS (Local Agent Reasoning Scheduler) Phase 1 CLI Orchestrator.

### Added
- **Interactive TUI Chat Shell (`lars chat`)**: Boots a stateful, interactive terminal loop with colored outputs, active module indicators, and multi-turn conversation memory.
- **Progressive Task Planner & Intent Classifier**: Decomposes natural language developer commands into sequential task states (e.g. rename, clear, create, format) using regex structural heuristics.
- **Dynamic Confidence Routing Engine**: Evaluates task descriptions and routes them to deterministic execution modules (confidence score >= 0.7) or local LLM context queries (confidence score < 0.7).
- **Mini-LATS Safe Execution Broker**: Implements safety validation. Before renaming or refactoring code files, creates a staging backup, executes the compiler (`npx tsc --noEmit`), and triggers an automatic rollback if compilation fails.
- **Sandbox Containment Security Guard**: Validates that all file crawls, edits, and process spawns resolve strictly inside the workspace boundary, terminating process execution on violation.
- **Context Compression Preprocessor**: Leverages an in-memory database index of declarations to select symbol signatures, injecting them into prompts to save 90% of model prefill tokens.
- **Lightweight Volatile State Journal**: Sync-serializes workspace state into `.lars/lars.journal` to coordinate across command invocations with a sub-2KB file footprint.
- **Local Ollama Integration & Model Setup Script (`setup-slm.sh`)**: Automates local Ollama setup and pulls Qwen-2.5-Coder-1.5B for fast offline reasoning.
- **Unified Test Runner**: Runs all step-by-step verification, benchmarking, and security escape tests.
