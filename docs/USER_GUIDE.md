# User Guide

Learn how to use the AI PR Reviewer plugin to automate code reviews in your Azure DevOps pipelines.

---

## Overview

The plugin has three main actions:

1. **`createPR`** — Create a new pull request and optionally get an AI review
2. **`reviewPR`** — Fetch an existing PR and post an AI-generated review comment
3. **`commentPR`** — Post a manually authored comment tagged as AI-generated

---

## Action 1: Create PR with AI Review

### When to Use
- Automating branch creation and PR opening from ADO pipelines
- Automatically generating AI code reviews as part of CI/CD
- Catching issues before human review

### Basic Example

```yaml
- task: AiPrReviewer@1
  inputs:
    action: createPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    sourceBranch: feature/my-feature
    targetBranch: main
    prTitle: "Add new API endpoint"
    prDescription: "This PR adds a POST /api/items endpoint with validation"
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

### What Happens

1. Plugin checks if PR already exists (same source→target branch)
2. If not, creates the PR
3. If `enableAiReview: true`, fetches the diff
4. Sends diff to Claude AI
5. Posts review comment on the PR
6. Outputs `PrUrl` and `PrNumber` for downstream tasks

### Options Explained

| Input | Required | Default | Description |
|---|---|---|---|
| `sourceBranch` | For `createPR` | `$(Build.SourceBranchName)` | Your feature branch |
| `targetBranch` | No | `main` | Where you want to merge |
| `prTitle` | No | `[branch]: automated PR` | Title shown on PR |
| `prDescription` | No | Empty | Body of PR, supports markdown |
| `failOnExistingPR` | No | `false` | Fail if PR exists, or reuse it |

### Example: Conditional PR Creation

Only create PR for `release/*` branches:

```yaml
- task: AiPrReviewer@1
  condition: startsWith(variables['Build.SourceBranch'], 'refs/heads/release/')
  inputs:
    action: createPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    sourceBranch: $(Build.SourceBranchName)
    targetBranch: main
    prTitle: "Release: $(Build.SourceBranchName)"
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

---

## Action 2: Review Existing PR

### When to Use
- Periodically reviewing open PRs
- Running AI review on demand
- Bulk-reviewing multiple PRs

### Basic Example

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
    aiModel: claude-opus-4-6  # More detailed
```

### What Happens

1. Fetches PR details and diff from provider
2. Sends to Claude AI
3. Posts review comment
4. Task completes

### Example: Triggered by Webhook

```yaml
trigger: none

parameters:
  - name: prNumber
    displayName: 'PR Number'
    type: number
    default: 1

variables:
- group: pr-review-secrets

steps:
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    prNumber: ${{ parameters.prNumber }}
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

User can trigger via: **Pipelines → Run pipeline → Enter PR number**

---

## Action 3: Post Comment

### When to Use
- Posting build results to PR
- Sharing test reports
- Manual notes about changes

### Basic Example

```yaml
- task: AiPrReviewer@1
  inputs:
    action: commentPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    prNumber: $(System.PullRequest.PullRequestNumber)
    commentBody: |
      ### Build Status: ✅ Passed

      - **Tests:** 245 passed, 0 failed
      - **Coverage:** 87% (+2% from main)
      - **Performance:** ✅ No regressions
      - **Linting:** ✅ All checks passed

      Ready for merge!
```

### Comment Format

Comments are automatically tagged with:
```
💬 AI PR Comment | Posted by AI PR Reviewer via Azure DevOps
```

This helps reviewers know it's a bot-generated comment.

---

## Claude Model Selection

### Three Models Available

| Model | Speed | Quality | Best For | Cost |
|---|---|---|---|---|
| `claude-opus-4-6` | Slower (↑) | Highest (↑) | Complex reviews, security audits, large PRs | $15 / 1M input tokens |
| `claude-sonnet-4-6` | Balanced | High | General use (recommended) | $3 / 1M input tokens |
| `claude-haiku-4-5-20251001` | Fast (↓) | Good | High-volume pipelines, quick feedback | $0.80 / 1M input tokens |

### Decision Tree

```
Is PR very large (1000+ lines changed)?
├─ Yes → Use claude-opus-4-6 (handles more tokens)
└─ No → Continue

Is PR for critical code (security, core logic)?
├─ Yes → Use claude-opus-4-6 (most thorough)
└─ No → Continue

Do you run many PRs per day?
├─ Yes → Use claude-haiku-4-5 (cost savings)
└─ No → Use claude-sonnet-4-6 (default, balanced)
```

### Example: Model per PR Type

```yaml
steps:
- task: AiPrReviewer@1
  displayName: 'Review security PR'
  condition: contains(variables['Build.SourceBranch'], 'security')
  inputs:
    action: reviewPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    prNumber: 42
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-opus-4-6  # Thorough for security

- task: AiPrReviewer@1
  displayName: 'Review hotfix PR'
  condition: contains(variables['Build.SourceBranch'], 'hotfix')
  inputs:
    action: reviewPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    prNumber: 42
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-haiku-4-5-20251001  # Fast for urgent fixes
```

---

## AI Review Context

The `aiReviewContext` parameter allows you to customize what the AI looks for:

### Examples

```yaml
# Security-focused
aiReviewContext: |
  Focus on:
  - SQL injection risks
  - Authentication/authorization flaws
  - Exposed secrets
  - Insecure dependencies

# Performance-focused
aiReviewContext: |
  Check for:
  - N+1 queries
  - Inefficient loops
  - Memory leaks
  - Blocking operations

# Style/consistency
aiReviewContext: |
  Enforce:
  - Naming conventions
  - Code structure
  - Docstring requirements
  - Configuration consistency
```

### Use Case: Department-Specific Reviews

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
    aiModel: claude-sonnet-4-6
    aiReviewContext: |
      This is a backend API change.

      Focus on:
      - Database performance (query optimization)
      - API contract (backwards compatibility)
      - Error handling (proper status codes)
      - Security (authentication/validation)
```

---

## Handling Large PRs

### Problem: Diff Too Large

Large PRs can exceed token limits. The plugin truncates diffs using `aiMaxDiffLines`.

### Solution: Adjust Truncation

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
    aiModel: claude-opus-4-6  # Handles more tokens
    aiMaxDiffLines: 2000  # Up from default 500
```

### Best Practice: Keep PRs Smaller

The best approach is to avoid large PRs:
- Split into multiple smaller PRs
- Review in stages (backend, frontend, tests)
- Use feature branches strategically

---

## Cost Estimation

### Token Usage Estimates

Approximate tokens per PR (input only):

| Diff Size | Tokens | Haiku Cost | Sonnet Cost | Opus Cost |
|---|---|---|---|---|
| 100 lines | ~500 | $0.0004 | $0.0015 | $0.0075 |
| 500 lines | ~2,500 | $0.002 | $0.0075 | $0.0375 |
| 1000 lines | ~5,000 | $0.004 | $0.015 | $0.075 |
| 2000 lines | ~10,000 | $0.008 | $0.03 | $0.15 |

*Costs are approximate and based on 2026 pricing. Output tokens typically add 20-30% more.*

### Cost Optimization

1. **Use Haiku for quick feedback:** `$0.80/1M tokens`
2. **Use Sonnet for general reviews:** `$3/1M tokens` (recommended)
3. **Use Opus only for critical code:** `$15/1M tokens`
4. **Keep PRs small:** Fewer lines = fewer tokens = lower cost
5. **Disable AI review for simple changes:** `enableAiReview: false` when not needed

### Budget Calculator

For a team with 20 PRs per day:
- **Scenario 1:** All with Haiku, avg 1000 lines each
  - ~100K tokens/day × $0.80 = **$0.08/day** (~$2/month)
- **Scenario 2:** Mix of Sonnet + Haiku
  - ~100K tokens/day × $2 average = **$0.20/day** (~$6/month)
- **Scenario 3:** All with Opus
  - ~100K tokens/day × $15 = **$1.50/day** (~$45/month)

---

## Output Variables

After `createPR` or `reviewPR`, you can use output variables in downstream steps:

### Example: Notify Slack

```yaml
- task: AiPrReviewer@1
  name: CreatePR
  inputs:
    action: createPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    sourceBranch: $(Build.SourceBranchName)
    targetBranch: main
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6

- task: SlackNotification@0
  inputs:
    webhookUrl: $(SlackWebhook)
    message: |
      New PR created: $(CreatePR.PrUrl)
      PR #$(CreatePR.PrNumber)
      AI review complete ✅
```

### Available Variables

- `PrUrl` — Full URL to the PR/MR
- `PrNumber` — Numeric PR ID (use in `/issues/123` endpoints)

---

## Troubleshooting

### "No diff to review"

**Cause:** Branch has no changes or hasn't been pushed yet

**Solution:**
1. Verify branch has actual commits
2. Ensure target branch is correct
3. Check for merge conflicts preventing diff

### "Review took too long"

**Cause:** Diff is very large, processing slowly

**Solution:**
1. Set `aiMaxDiffLines` to limit review scope
2. Use `claude-haiku-4-5` for faster (lighter) reviews
3. Break PR into smaller parts

### "Same review posted twice"

**Cause:** Task ran twice, both created comments

**Solution:**
1. Add check before posting: "Does comment already exist?"
2. Or: Use `failOnExistingPR: true` during `createPR` to prevent duplicate creation
3. Delete duplicate comment manually for now

---

## Next Steps

- See provider guides:
  - [SETUP_GITHUB.md](./SETUP_GITHUB.md) for GitHub
  - [SETUP_GITLAB.md](./SETUP_GITLAB.md) for GitLab
  - [SETUP_BITBUCKET.md](./SETUP_BITBUCKET.md) for Bitbucket
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for error messages
- See [FAQ.md](./FAQ.md) for more questions
