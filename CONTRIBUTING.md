# Contributing to LARS

First off, thank you for taking the time to contribute! Contributions from the community help make LARS a better tool for everyone.

This document outlines the guidelines and best practices for contributing to the LARS repository.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to the project maintainers.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please create a new issue using our [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md). Be sure to include:
- A clear, descriptive title.
- Steps to reproduce the issue.
- Expected vs. actual behavior.
- Relevant log files, command outputs, or screenshots.
- Details about your environment (OS version, Node.js version, LARS version).

### Suggesting Enhancements

We welcome suggestions for new features or optimizations! To request an enhancement:
- Create a new issue using our [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md).
- Explain the user story or problem this feature solves.
- Describe the proposed solution or design.

### Pull Requests

We follow a typical Git feature branch workflow for code contributions:

1. **Fork** the repository and clone it locally.
2. **Create a branch** for your edits: `git checkout -b feature/my-new-feature` or `bugfix/issue-id`.
3. **Write code** and ensure it adheres to our code style (run `npm run format`).
4. **Write tests** for your changes.
5. **Run the test suite** locally with `npm test` and ensure all tests pass.
6. **Commit your changes** using clean, descriptive commit messages.
7. **Push your branch** to your fork.
8. **Submit a Pull Request** (PR) to the `main` branch. Use our [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) to explain the changes.

## Development Setup

To set up a local development environment:

```bash
# Clone the repository
git clone https://github.com/gaurish676/LLM-PRG.git
cd LLM-PRG

# Install dependencies
npm install

# Compile the project
npm run build

# Run the tests
npm test
```

## Styling & Coding Standards

- We use **Prettier** for formatting. Run `npm run format` before committing.
- Keep the codebase **strictly structured** and flat as detailed in `DESIGN.md`.
- Keep direct dependencies to a minimum to maintain LARS's footprint.
- All file access and executions must check sandbox containment boundaries via `ensureSandbox` in `src/utils/sandbox.ts` to maintain security.
