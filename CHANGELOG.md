# Changelog

All notable changes to this project will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
