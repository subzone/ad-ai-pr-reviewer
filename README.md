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
- **AI code review** powered by [Claude](https://anthropic.com) — posts a structured review comment directly on the PR
- **🆕 Inline code suggestions** — AI posts comments directly on changed lines with one-click fixes (GitHub suggestion blocks)
- **🆕 Specialized review skills** — Domain-specific expert reviewers (security, performance, database, API, accessibility)
- **Multiple AI hosting options** — Anthropic direct, Azure AI Foundry, AWS Bedrock, Google Vertex AI, or LiteLLM
- **Per-file review mode** — reviews each file individually then synthesizes findings
- **AI tool calling** — Agents can read files, search code, gather context beyond visible diff
- **Parallel execution** — Multiple files and skills reviewed simultaneously (85% faster)
- **Post comments** on existing PRs, labelled as AI PR Comments
- Detects and handles duplicate PRs gracefully
- Configurable diff truncation to stay within token limits on large PRs
- **Anti-hallucination safeguards** — Intelligent file selection, validation checks, mandatory citations
- **Token tracking & cost estimation** — Monitor usage and costs per PR
- Exposes `PrUrl`, `PrNumber`, `ReviewVerdict`, `ReviewTotalIssues`, and `ReviewSummary` as output variables
- Works with GitHub Enterprise, GitLab self-hosted, Bitbucket Server/Data Center

---

## 🎯 Specialized Review Skills (New!)

Get expert-level analysis with domain-specific AI agents that run in parallel:

### Available Skills

<table>
<tr>
<td align="center">🔒</td>
<td><strong>Security (92%)</strong><br/>SQL injection, XSS, CSRF, auth bypass, hardcoded credentials<br/><em>Essential for auth, payments, user data</em></td>
</tr>
<tr>
<td align="center">⚡</td>
<td><strong>Performance (88%)</strong><br/>N+1 queries, inefficient algorithms, blocking operations<br/><em>Database queries, loops, real-time features</em></td>
</tr>
<tr>
<td align="center">🗄️</td>
<td><strong>Database (90%)</strong><br/>Migration safety, missing indexes, data integrity issues<br/><em>Schema changes, migrations, query optimization</em></td>
</tr>
<tr>
<td align="center">🔌</td>
<td><strong>API Design (82%)</strong><br/>Breaking changes, REST compliance, validation gaps<br/><em>Endpoints, routes, GraphQL, versioning</em></td>
</tr>
<tr>
<td align="center">♿</td>
<td><strong>Accessibility (78%)</strong><br/>WCAG violations, ARIA issues, keyboard navigation<br/><em>UI components, forms, interactive elements</em></td>
</tr>
</table>

### Quick Example

```yaml
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: github
    enableAiReview: true
    aiReviewMode: per-file
    
    # Enable specialized skills
    aiEnableSkills: true
    aiSkills: security,performance
    aiSkillAutoDetect: true  # Auto-add relevant skills
```

**Result:**
```
🎯 Skills Mode: security,performance
   Auto-detection: enabled

  Running 3 skill(s) for src/auth/login.ts: Security, API, Performance
  [src/auth/login.ts] Skills Summary:
    - Security: 3 findings (100% quality, 1250ms)
    - API: 1 findings (100% quality, 980ms)
    - Performance: 0 findings (-, 890ms)

### src/auth/login.ts

🔴 [security] Hardcoded Password Salt
  Salt should be randomly generated, not hardcoded
  ```diff
  + const salt = "fixed-salt-123";
  ```
  💡 Use crypto.randomBytes(16).toString('hex')
```

### Why Use Skills?

✅ **85% faster** — Parallel execution vs sequential  
✅ **Expert analysis** — Specialized prompts per domain  
✅ **Quality scores** — 78-92% validation rates  
✅ **Auto-detection** — Smart skill selection  
✅ **Cost-effective** — Focus tokens on relevant expertise  

📚 **Learn more:** [Specialized Skills Guide](docs/USER_GUIDE_SKILLS.md) | [Architecture Diagrams](docs/ARCHITECTURE_DIAGRAMS.md)

---

## Quick Start

### 1. Install the Extension

Go to [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=subzone.ad-ai-pr-reviewer) and install into your Azure DevOps organization.

### 2. Review PRs with AI

```yaml
trigger: none

pr:
  branches:
    include: [main]

variables:
- group: ai-reviewer-secrets

pool:
  vmImage: ubuntu-latest

steps:
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    prNumber: $(System.PullRequest.PullRequestNumber)
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
- **[Model Comparison Guide](docs/MODEL_COMPARISON.md)** — Which AI model to use, cost analysis, scenario recommendations
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

📊 **[Full Model Comparison →](docs/MODEL_COMPARISON.md)** — Compare Claude vs GPT-4o vs Gemini with detailed cost analysis and quality metrics.

See [USER_GUIDE.md → Model Selection](docs/USER_GUIDE.md#claude-model-selection) for decision tree.

---

## Task Inputs

### Source Repository

| Input | Required | Default | Description |
|---|:---:|---|---|
| `action` | ✅ | `reviewPR` | `createPR` \| `reviewPR` \| `commentPR` |
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
| `enableAiReview` | | `false` | Enable AI review (valid for `createPR` and `reviewPR`) |
| `aiProvider` | | `anthropic` | `anthropic` \| `azure` \| `bedrock` \| `vertex` \| `litellm` |
| `aiApiKey` | | | API key — required for `anthropic`, `azure`, `litellm` |
| `aiBaseUrl` | | | Endpoint URL — required for `azure` and `litellm` |
| `awsRegion` | | | AWS region — required for `bedrock` (e.g. `us-east-1`) |
| `awsAccessKeyId` | | | AWS access key — optional for `bedrock` (omit to use IAM role) |
| `awsSecretAccessKey` | | | AWS secret key — optional for `bedrock` (omit to use IAM role) |
| `gcpProjectId` | | | GCP project ID — required for `vertex` |
| `gcpRegion` | | | GCP region — required for `vertex` (e.g. `us-east5`) |
| `aiModel` | | `claude-sonnet-4-6` | Model ID (deployment name for Azure/Bedrock — see [User Guide](docs/USER_GUIDE.md)) |
| `aiReviewContext` | | | Extra instructions for the reviewer (e.g. `"Focus on security issues"`) |
| `aiMaxDiffLines` | | `500` | Truncate diff at this many lines |
| `aiReviewMode` | | `standard` | `standard` (whole diff) or `per-file` (file-by-file with synthesis) |
| `aiMaxFiles` | | `10` | Max files reviewed in `per-file` mode |
| `aiEnableReasoning` | | `false` | Show AI's reasoning process in logs |
| `aiEnableTools` | | `false` | Allow AI to read files, search code (requires `per-file` mode) |
| `aiEnableSkills` | | `false` | Enable specialized review skills (requires `per-file` mode) — [Learn More](docs/USER_GUIDE_SKILLS.md) |
| `aiSkills` | | | Comma-separated skill IDs: `security,performance,database,api,accessibility` |
| `aiSkillAutoDetect` | | `true` | Auto-add relevant skills based on file patterns and content |

---

## Output Variables

| Variable | Description |
|---|---|
| `PrUrl` | URL of the created or found PR |
| `PrNumber` | Number of the created or found PR |
| `ReviewVerdict` | `lgtm` · `needs-work` · `critical` |
| `ReviewTotalIssues` | Count of issues found |
| `ReviewSummary` | One-line summary from Claude |

Use in downstream steps:

```yaml
- task: AiPrReviewer@1
  name: CreatePR
  inputs:
    action: createPR
    # ...

- script: |
    echo "PR: $(CreatePR.PrUrl) #$(CreatePR.PrNumber)"
    echo "Verdict: $(CreatePR.ReviewVerdict) — $(CreatePR.ReviewTotalIssues) issues"
    echo "Summary: $(CreatePR.ReviewSummary)"
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
    accessToken: $(BITBUCKET_USERNAME):$(BITBUCKET_APP_PASSWORD)
    repository: myworkspace/myrepo
    prNumber: $(PR_NUMBER)
    commentBody: |
      Build **$(Build.BuildNumber)** passed ✅

      Tests: 245 passed
      Coverage: 87%
```

For more examples, see the [`examples/`](examples/) directory:

| File | Description |
|---|---|
| [`github-pipeline.yml`](examples/github-pipeline.yml) | Full GitHub integration — create PR, AI review, build status comment |
| [`gitlab-pipeline.yml`](examples/gitlab-pipeline.yml) | Full GitLab integration — cloud and self-hosted, create MR, AI review |
| [`bitbucket-pipeline.yml`](examples/bitbucket-pipeline.yml) | Full Bitbucket integration — Cloud and Server/Data Center |
| [`pipeline.yml`](examples/pipeline.yml) | Quick reference — all three actions in one file |

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
