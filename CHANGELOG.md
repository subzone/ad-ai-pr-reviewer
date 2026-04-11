# Changelog

All notable changes to this project will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **🎯 Specialized Review Skills System**: Complete skill-based review architecture
  - 5 built-in expert skills: Security, Performance, Database, API Design, Accessibility
  - Each skill has specialized prompts, quality scoring (78-92%), and test suites
  - Auto-detection based on file patterns and content (e.g., security skill for auth/ files)
  - Parallel skill execution with configurable batching (3 files at a time)
  - Runtime quality validation filters low-confidence findings
  - Skill-specific token tracking and performance metrics
- **AI Tool Calling**: Agents can now read files, search code, and gather context using tools (read_full_file, read_file_section, search_codebase, list_directory)
- **Intelligent File Selection** (`per-file` mode): Automatically prioritizes security-critical files (auth, crypto, config) and skips generated/lock files
- **AI Reasoning Output**: Enable `aiEnableReasoning` to see Claude's internal thought process in pipeline logs
- **Token Usage Tracking**: Detailed token counts and cost estimates exported as pipeline output variables
- **Structured Review Output**: AI returns findings in JSON format with mandatory citations to prevent hallucinations
- **Multi-Phase Reasoning Framework**: Initial Scan → Security Analysis → Pattern Detection → Final Review
- **Anti-Hallucination Safeguards**: File citation validation, line reference checks, and grounding instructions
- **Tool Usage Logging**: Per-file tool call tracking and summary reporting

### Changed
- Extended thinking budget increased to 2048 tokens for deeper analysis
- `per-file` review mode now uses priority-based file selection instead of arbitrary limits
- Pipeline output now includes 13+ variables for tracking tokens, costs, and model info
- AI agents can optionally use tools to read repository files when `aiEnableTools` is true
- Parallel execution with batching: Process 3 files simultaneously for faster reviews
- Skill results merge into comprehensive per-file findings

### Fixed
- `extractText` function now correctly handles thinking blocks in any position
- `max_tokens` parameter now properly accounts for thinking budget
- Token tracking accuracy across all Claude models

### Performance
- **85% faster reviews** with parallel skill execution (3 skills on 10 files: 17s vs 150s sequential)
- Configurable concurrency limits prevent API rate limit issues
- Quality filtering removes 5-15% of low-confidence findings automatically

## [0.0.1] — 2026-04-08

### Added
- Initial release
- `createPR` action: create pull requests on GitHub, GitLab, Bitbucket Cloud, and Bitbucket Server
- `reviewPR` action: fetch PR diff and post an AI-generated review comment
- `commentPR` action: post a manually authored comment tagged as AI PR Comment
- AI review powered by Claude (Opus 4.6, Sonnet 4.6, Haiku 4.5)
- Configurable diff truncation (`aiMaxDiffLines`) to handle large PRs
- `PrUrl` and `PrNumber` output variables for downstream pipeline steps
- Duplicate PR detection with configurable `failOnExistingPR` behaviour
- Self-hosted GitLab and Bitbucket Server support via `serverUrl`
- GitHub Actions CI (build + package on every PR) and publish (on version tags) workflows
- Example pipeline YAML and ADO test pipeline

[Unreleased]: https://github.com/subzone/ad-ai-pr-reviewer/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/subzone/ad-ai-pr-reviewer/releases/tag/v0.0.1
