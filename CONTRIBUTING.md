# Contributing

Thank you for your interest in contributing to AI PR Reviewer!

## Getting Started

```bash
git clone git@github.com:subzone/ad-ai-pr-reviewer.git
cd ad-ai-pr-reviewer/task
npm install
npm run build:watch   # recompile on save
```

## Project Structure

```
task/src/
├── index.ts              # Entry point and action routing
├── providers/
│   ├── base.ts           # Shared interfaces and comment formatters
│   ├── github.ts         # GitHub API (Octokit)
│   ├── gitlab.ts         # GitLab REST API
│   └── bitbucket.ts      # Bitbucket Cloud + Server
└── ai/
    └── reviewer.ts       # Claude integration (Anthropic SDK)
```

## Adding a New Provider

1. Create `task/src/providers/yourprovider.ts` implementing the `Provider` interface from `base.ts`
2. Register it in the `buildProvider()` switch in `index.ts`
3. Add it as a `pickList` option in `task/task.json` under the `provider` input
4. Update the supported providers table in `README.md`

## Pull Request Guidelines

- Keep changes focused — one feature or fix per PR
- Run `npm run build` and confirm it compiles cleanly before opening a PR
- Update `README.md` if you're adding or changing inputs
- Add an entry to `CHANGELOG.md` under `[Unreleased]`

## Releasing (maintainers)

```bash
git tag v0.1.0
git push origin v0.1.0
```

The publish workflow handles versioning, packaging, and Marketplace upload automatically.
