# AI PR Reviewer

Create pull requests and post **AI-generated code review comments** on GitHub, GitLab, and Bitbucket — directly from your Azure DevOps pipeline.

---

## What it does

This extension adds a single pipeline task — **AiPrReviewer** — with three actions:

| Action | Description |
|---|---|
| **Create PR** | Opens a pull request on your source repository from any ADO pipeline stage |
| **AI Review PR** | Fetches the PR diff, sends it to Claude, and posts a structured review comment |
| **Comment PR** | Posts a manually authored comment clearly labelled as AI-generated |

---

## Supported providers

- **GitHub** (cloud)
- **GitLab** (cloud and self-hosted)
- **Bitbucket Cloud**
- **Bitbucket Server / Data Center**

---

## AI models

Reviews are powered by [Anthropic Claude](https://anthropic.com). Choose the right model for your use case:

| Model | Best for |
|---|---|
| Claude Opus 4.6 | Deep reviews, security audits, complex codebases |
| Claude Sonnet 4.6 | Recommended — great quality at reasonable speed |
| Claude Haiku 4.5 | High-volume pipelines, speed-sensitive workflows |

---

## Example pipeline

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
    aiReviewContext: "Focus on security issues and breaking changes."
```

---

## Output variables

The task exposes `PrUrl` and `PrNumber` as pipeline output variables for use in downstream steps.

---

## Source & documentation

Full documentation, examples, and source code at [github.com/subzone/ad-ai-pr-reviewer](https://github.com/subzone/ad-ai-pr-reviewer).

Issues and contributions welcome.
