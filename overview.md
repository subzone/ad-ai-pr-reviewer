# AI PR Reviewer

Create pull requests and post **AI-generated code review comments** on GitHub, GitLab, and Bitbucket — directly from your Azure DevOps pipeline.

---

## What You Get

✨ **AI-Powered Code Reviews**
Use Claude to automatically review PR diffs and post structured feedback

🚀 **Automated PR Creation**
Create pull requests from your ADO pipeline with one task

🔍 **Comprehensive Provider Support**
Works with GitHub, GitLab (cloud & self-hosted), Bitbucket Cloud, and Bitbucket Server

⚙️ **Flexible & Customizable**
Choose Claude models, customize review context, adjust diff limits for your needs

---

## What it does

This extension adds a single pipeline task — **AiPrReviewer** — with three actions:

| Action | Description |
|---|---|
| **Create PR** | Opens a pull request on your source repository from any ADO pipeline stage |
| **AI Review PR** | Fetches the PR diff, sends it to Claude, and posts a structured review comment |
| **Comment PR** | Posts a manually authored comment clearly labelled as AI-generated |

---

## Before You Use This

You'll need:
- ✅ GitHub/GitLab/Bitbucket Personal Access Token (see [setup guide](https://github.com/subzone/ad-ai-pr-reviewer/tree/main/docs))
- ✅ Anthropic API Key (free trial at [console.anthropic.com](https://console.anthropic.com))

---

## Supported Providers

| Provider | Create PR | AI Review | Comment | Self-Hosted |
|---|---|---|---|---|
| **GitHub** | ✅ | ✅ | ✅ | GitHub Enterprise |
| **GitLab** | ✅ | ✅ | ✅ | ✅ Yes (serverUrl) |
| **Bitbucket Cloud** | ✅ | ✅ | ✅ | N/A |
| **Bitbucket Server / Data Center** | ✅ | ✅ | ✅ | ✅ Yes (serverUrl) |

*For self-hosted instances (GitLab, Bitbucket), provide serverUrl in task configuration*

---

## AI Models

Reviews are powered by **[Anthropic Claude](https://anthropic.com)**. Choose the right model:

| Model | Speed | Quality | Best For | Cost |
|---|---|---|---|---|
| **Claude Opus 4.6** | 🐢 | ⭐⭐⭐ | Complex code, security audits | $15/1M tokens |
| **Claude Sonnet 4.6** | 🚴 | ⭐⭐ | General use (recommended) | $3/1M tokens |
| **Claude Haiku 4.5** | 🚀 | ⭐ | High-volume, cost-sensitive | $0.80/1M tokens |

---

## Quick Start Example

```yaml
trigger:
  - feature/*

variables:
- group: pr-review-secrets  # Variable group with GITHUB_PAT, ANTHROPIC_API_KEY

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
    prTitle: "Automated PR: $(Build.SourceBranchName)"
    prDescription: "Created by ADO pipeline - Build #$(Build.BuildNumber)"
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
    aiReviewContext: "Focus on security and performance issues"
```

---

## Key Features

### 🤖 Claude-Powered Reviews
- Analyzes PR diffs in seconds
- Posts structured feedback
- Customizable review context (security, performance, style, etc.)

### 🔗 Multiple Git Providers
- GitHub (cloud & Enterprise)
- GitLab (cloud & self-hosted)
- Bitbucket (Cloud & Server)
- Not tied to any single provider

### ⚡ Fast & Reliable
- Real-time API calls (no batch delays)
- Configurable diff truncation
- Handles large PRs gracefully

### 🔐 Secure
- Tokens stored as ADO secrets
- No data persistence
- Anthropic API encryption
- Supports self-hosted instances

### 📊 Integrates with Your Workflow
- Output variables for downstream tasks
- Use in conditional steps
- Chain with other pipeline tasks
- Scheduled or event-triggered runs

---

## Setup & Configuration

### 1. Install Extension
Install from this Marketplace page into your Azure DevOps organization

### 2. Create Credentials
- Generate token from your git provider (GitHub/GitLab/Bitbucket)
- Get Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
- Store both as secrets in ADO variable groups

### 3. Create Pipeline
Use the [example pipeline](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/examples/pipeline.yml) as template and customize for your needs

### 4. Configure Task
Set action, provider, repository, and credentials in task inputs

### Detailed Setup Guides
- [GitHub Setup](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/SETUP_GITHUB.md)
- [GitLab Setup](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/SETUP_GITLAB.md)
- [Bitbucket Setup](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/SETUP_BITBUCKET.md)
- [Azure DevOps Setup](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/SETUP_ADO.md)

---

## Output Variables

The task exposes these variables for use in downstream steps:

- `PrUrl` — Full URL to the created/reviewed PR
- `PrNumber` — Numeric PR identifier

Example:
```yaml
- task: AiPrReviewer@1
  name: CreatePR
  inputs:
    action: createPR
    # ...

- script: |
    echo "PR created: $(CreatePR.PrUrl)"
    echo "PR #: $(CreatePR.PrNumber)"
```

---

## Cost Estimate

**Typical monthly cost:** $2–$50 depending on PR volume and model

- 20 PRs/day with Haiku: ~$2/month
- 20 PRs/day with Sonnet: ~$6/month
- 20 PRs/day with Opus: ~$30/month

See [FAQ](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/FAQ.md#how-much-does-ai-review-cost) for detailed pricing.

---

## Questions & Support

- **Documentation:** [github.com/subzone/ad-ai-pr-reviewer](https://github.com/subzone/ad-ai-pr-reviewer)
- **Setup guides:** See `docs/` folder in repo
- **Troubleshooting:** [TROUBLESHOOTING.md](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/TROUBLESHOOTING.md)
- **FAQ:** [FAQ.md](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/FAQ.md)
- **Report issues:** [GitHub Issues](https://github.com/subzone/ad-ai-pr-reviewer/issues)

---

## About

**Authors:** [subzone](https://github.com/subzone)
**License:** MIT
**Source:** [github.com/subzone/ad-ai-pr-reviewer](https://github.com/subzone/ad-ai-pr-reviewer)

Powered by [Anthropic Claude](https://www.anthropic.com)
