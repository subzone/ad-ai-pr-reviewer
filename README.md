# AI PR Reviewer — Azure DevOps Extension

[![CI](https://github.com/subzone/ad-ai-pr-reviewer/actions/workflows/ci.yml/badge.svg)](https://github.com/subzone/ad-ai-pr-reviewer/actions/workflows/ci.yml)
[![Marketplace](https://img.shields.io/badge/ADO%20Marketplace-subzone.ad--ai--pr--reviewer-blue?logo=azuredevops)](https://marketplace.visualstudio.com/items?itemName=subzone.ad-ai-pr-reviewer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An Azure DevOps pipeline task that creates pull requests and posts **AI-generated code review comments** on GitHub, GitLab, and Bitbucket — all from your ADO pipeline. Comments are clearly marked as AI-generated so reviewers always know what they're looking at.

![icon](images/extension-icon.png)

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Setup Guides](#setup-guides)
- [How to Use](#how-to-use)
- [Supported Providers](#supported-providers)
- [Claude Models](#claude-models)
- [Task Inputs](#task-inputs)
- [Output Variables](#output-variables)
- [Examples](#examples)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Features

- **Create PRs** on GitHub, GitLab, Bitbucket Cloud, or Bitbucket Server from any ADO pipeline
- **AI code review** powered by [Claude](https://anthropic.com) (Opus, Sonnet, or Haiku) — posts a structured review comment directly on the PR
- **Post comments** on existing PRs, labelled as AI PR Comments
- Detects and handles duplicate PRs gracefully
- Configurable diff truncation to stay within token limits on large PRs
- Exposes `PrUrl` and `PrNumber` as output variables for downstream steps
- Works with GitHub Enterprise, GitLab self-hosted, Bitbucket Server/Data Center

---

## Quick Start

### 1. Install the Extension

Go to [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=subzone.ad-ai-pr-reviewer) and install into your Azure DevOps organization.

### 2. Create PR with AI Review

```yaml
- task: AiPrReviewer@1
  inputs:
    action: createPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    sourceBranch: $(Build.SourceBranchName)
    targetBranch: main
    prTitle: "$(Build.SourceBranchName): automated PR"
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

See **[Quick Start Examples](#examples)** below for more.

---

## Setup Guides

Choose your git provider and follow the setup guide:

### Per-Provider Setup
- **[GitHub Setup Guide](docs/SETUP_GITHUB.md)** (classic & fine-grained tokens)
- **[GitLab Setup Guide](docs/SETUP_GITLAB.md)** (cloud & self-hosted)
- **[Bitbucket Setup Guide](docs/SETUP_BITBUCKET.md)** (Cloud & Server/Data Center)
- **[Azure DevOps Setup Guide](docs/SETUP_ADO.md)** (pipelines, variable groups, secrets)

### General Resources
- **[User Guide](docs/USER_GUIDE.md)** — How to use each action, choose models, customize reviews
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** — Error messages and solutions
- **[FAQ](docs/FAQ.md)** — Common questions, costs, security

---

## Supported Providers

| Provider | Create PR | AI Review | Post Comment |
|---|:---:|:---:|:---:|
| GitHub | ✅ | ✅ | ✅ |
| GitLab (cloud) | ✅ | ✅ | ✅ |
| GitLab (self-hosted) | ✅ | ✅ | ✅ |
| Bitbucket Cloud | ✅ | ✅ | ✅ |
| Bitbucket Server / Data Center | ✅ | ✅ | ✅ |

---

## How to Use

The plugin has three main actions:

### 1. `createPR` — Create a Pull Request

Creates a PR and optionally gets an AI review:

```yaml
- task: AiPrReviewer@1
  inputs:
    action: createPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    sourceBranch: feature/my-change
    targetBranch: main
    prTitle: "Add new API endpoint"
    prDescription: "Adds POST /api/items with validation"
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

### 2. `reviewPR` — Review an Existing PR

Fetches a PR's diff and posts an AI review:

```yaml
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    prNumber: 42
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-opus-4-6
    aiReviewContext: "Focus on security and breaking changes"
```

### 3. `commentPR` — Post a Manual Comment

Posts a comment tagged as AI-generated:

```yaml
- task: AiPrReviewer@1
  inputs:
    action: commentPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    prNumber: 42
    commentBody: |
      Build **$(Build.BuildNumber)** passed. Ready for review.
```

---

## Claude Models

| Model | Speed | Quality | Best for |
|---|---|---|---|
| `claude-opus-4-6` | Slower | Highest | Complex reviews, security audits |
| `claude-sonnet-4-6` | Balanced | High | General use (recommended) |
| `claude-haiku-4-5-20251001` | Fastest | Good | High-volume pipelines, cost-sensitive |

**Cost estimate for 20 PRs/day:**
- Haiku: ~$2/month
- Sonnet: ~$6/month
- Opus: ~$30/month

See [USER_GUIDE.md → Model Selection](docs/USER_GUIDE.md#claude-model-selection) for decision tree.

---

## Task Inputs

### Source Repository

| Input | Required | Default | Description |
|---|:---:|---|---|
| `action` | ✅ | `createPR` | `createPR` \| `reviewPR` \| `commentPR` |
| `provider` | ✅ | `github` | `github` \| `gitlab` \| `bitbucket` \| `bitbucket-server` |
| `accessToken` | ✅ | | PAT with repo read/write and PR permissions. Use a secret variable. |
| `repository` | ✅ | | Repository in `owner/repo` format |
| `serverUrl` | | | Required for GitLab self-hosted or Bitbucket Server (e.g. `https://gitlab.mycompany.com`) |

### Pull Request

| Input | Required | Default | Description |
|---|:---:|---|---|
| `sourceBranch` | | `$(Build.SourceBranchName)` | Head branch (for `createPR`) |
| `targetBranch` | | `main` | Base branch (for `createPR`) |
| `prTitle` | | | PR title (for `createPR`) |
| `prDescription` | | | PR body text, markdown supported (for `createPR`) |
| `prNumber` | | | PR/MR number (for `reviewPR` and `commentPR`) |
| `commentBody` | | | Comment text, markdown supported (for `commentPR`) |
| `failOnExistingPR` | | `false` | Fail the task if a PR for the same branches already exists |

### AI Review

| Input | Required | Default | Description |
|---|:---:|---|---|
| `enableAiReview` | | `false` | Enable Claude AI review (valid for `createPR` and `reviewPR`) |
| `aiApiKey` | | | Anthropic API key. Use a secret variable. Get one at [console.anthropic.com](https://console.anthropic.com) |
| `aiModel` | | `claude-sonnet-4-6` | `claude-opus-4-6` \| `claude-sonnet-4-6` \| `claude-haiku-4-5-20251001` |
| `aiReviewContext` | | | Extra instructions for the reviewer (e.g. `"Focus on security issues"`) |
| `aiMaxDiffLines` | | `500` | Truncate diff at this many lines to avoid token limits on large PRs |

---

## Output Variables

| Variable | Description |
|---|---|
| `PrUrl` | URL of the created or found PR |
| `PrNumber` | Number of the created or found PR |

Use in downstream steps:

```yaml
- task: AiPrReviewer@1
  name: CreatePR
  inputs:
    action: createPR
    # ...

- script: echo "PR: $(CreatePR.PrUrl) #$(CreatePR.PrNumber)"
  displayName: 'Show PR Details'
```

---

## Access Token Permissions

### GitHub
- **Scopes:** `repo` (or `pull_requests: write` + `contents: read` for fine-grained PATs)

### GitLab
- **Scopes:** `api` or `read_api` + `write_repository`

### Bitbucket Cloud
- **App Password scopes:** `Repositories: Read`, `Pull requests: Read & Write`

### Bitbucket Server
- **Personal Access Token** with `Repository: Read`, `Pull requests: Read & Write`

### Anthropic (AI review)
- API key from [console.anthropic.com](https://console.anthropic.com)

---

## Examples

### Example 1: Create PR with AI Review (GitHub)

```yaml
trigger:
  - feature/*

variables:
- group: github-secrets

pool:
  vmImage: 'ubuntu-latest'

steps:
- task: AiPrReviewer@1
  inputs:
    action: createPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    sourceBranch: $(Build.SourceBranchName)
    targetBranch: main
    prTitle: "$(Build.SourceBranchName): automated PR"
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

### Example 2: Review Existing PR (GitLab)

```yaml
trigger: none

variables:
- group: gitlab-secrets

pool:
  vmImage: 'ubuntu-latest'

steps:
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: gitlab
    accessToken: $(GITLAB_PAT)
    repository: mygroup/myproject
    serverUrl: $(GITLAB_SERVER_URL)
    prNumber: $(PR_NUMBER)
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-opus-4-6
    aiReviewContext: "Focus on security and breaking changes"
```

### Example 3: Post Comment (Bitbucket)

```yaml
- task: AiPrReviewer@1
  inputs:
    action: commentPR
    provider: bitbucket
    accessToken: $(BITBUCKET_APP_PASSWORD)
    repository: myworkspace/myrepo
    prNumber: $(PR_NUMBER)
    commentBody: |
      Build **$(Build.BuildNumber)** passed ✅

      Tests: 245 passed
      Coverage: 87%
```

For more examples, see [`examples/pipeline.yml`](examples/pipeline.yml).

---

## Support & Documentation

- 📖 **[Full Documentation](https://github.com/subzone/ad-ai-pr-reviewer)** on GitHub
- 🔧 **[Setup Guides](docs/)** for each provider
- 🆘 **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** for error solutions
- ❓ **[FAQ](docs/FAQ.md)** for common questions
- 🐛 **[Report Issues](https://github.com/subzone/ad-ai-pr-reviewer/issues)** on GitHub

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

---

## License

[MIT](LICENSE)
