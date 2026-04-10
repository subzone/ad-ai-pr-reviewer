# User Guide

## Actions

The task has three `action` values:

| Action | Purpose |
|---|---|
| `reviewPR` | Fetch diff of an existing PR, send to Claude, post review comment |
| `createPR` | Open a PR on your git host; optionally trigger AI review immediately |
| `commentPR` | Post a custom comment on an existing PR |

---

## reviewPR — Review an open PR

Runs on every pull request targeting `main`. Uses the ADO-provided PR number automatically.

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
    provider: github            # github | gitlab | bitbucket | bitbucket-server
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    prNumber: $(System.PullRequest.PullRequestNumber)
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

**Manual trigger** (run against a specific PR number on demand):

```yaml
trigger: none

parameters:
- name: prNumber
  displayName: PR Number
  type: number

variables:
- group: ai-reviewer-secrets

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

Trigger via: **Pipelines → Run pipeline → enter PR number**

---

## createPR — Open a PR from a branch push

Runs when a feature branch is pushed. Creates the PR, then optionally reviews it.

```yaml
trigger:
  branches:
    include: [feature/*, fix/*]

pr: none

variables:
- group: ai-reviewer-secrets

pool:
  vmImage: ubuntu-latest

steps:
- task: AiPrReviewer@1
  inputs:
    action: createPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    sourceBranch: $(Build.SourceBranchName)
    targetBranch: main
    prTitle: "$(Build.SourceBranchName)"
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
    failOnExistingPR: false   # reuse PR if branch was already pushed
```

`PrUrl` and `PrNumber` are set as output variables after this step.

---

## commentPR — Post a custom comment

Post build results, test output, or any text on an open PR.

```yaml
- task: AiPrReviewer@1
  condition: always()
  inputs:
    action: commentPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo
    prNumber: $(System.PullRequest.PullRequestNumber)
    commentBody: |
      ## Build Result: $(Agent.JobStatus)

      | | |
      |---|---|
      | **Build** | $(Build.BuildNumber) |
      | **Status** | $(Agent.JobStatus) |
```

Comments are tagged automatically: `💬 AI PR Comment | Posted by AI PR Reviewer via Azure DevOps`

---

## All inputs

| Input | Actions | Default | Description |
|---|---|---|---|
| `action` | all | — | `reviewPR` · `createPR` · `commentPR` |
| `provider` | all | — | `github` · `gitlab` · `bitbucket` · `bitbucket-server` |
| `accessToken` | all | — | PAT / App Password for your git host |
| `repository` | all | — | `owner/repo` (GitHub/GitLab) or `PROJECT/repo` (Bitbucket) |
| `serverUrl` | all | — | Self-hosted URL, e.g. `https://gitlab.mycompany.com` |
| `prNumber` | review, comment | — | PR/MR number |
| `sourceBranch` | createPR | — | Feature branch to open PR from |
| `targetBranch` | createPR | `main` | Branch to merge into |
| `prTitle` | createPR | `[branch]: automated PR` | PR title |
| `prDescription` | createPR | — | PR body (markdown supported) |
| `failOnExistingPR` | createPR | `false` | Fail if PR already exists |
| `commentBody` | commentPR | — | Comment text (markdown supported) |
| `enableAiReview` | createPR, reviewPR | `false` | Post AI review comment |
| `aiApiKey` | createPR, reviewPR | — | Anthropic API key |
| `aiModel` | createPR, reviewPR | `claude-sonnet-4-6` | Model to use |
| `aiReviewContext` | createPR, reviewPR | — | Extra instructions for Claude |
| `aiMaxDiffLines` | createPR, reviewPR | `500` | Truncate diff at this many lines |
| `aiReviewMode` | createPR, reviewPR | `standard` | `standard` or `per-file` |
| `aiMaxFiles` | createPR, reviewPR | `10` | Max files reviewed in `per-file` mode |

---

## Output variables

Set after `reviewPR` or `createPR`:

| Variable | Description |
|---|---|
| `PrUrl` | Full URL to the PR |
| `PrNumber` | Numeric PR ID |
| `ReviewVerdict` | `lgtm` · `needs-work` · `critical` |
| `ReviewTotalIssues` | Count of issues found |
| `ReviewSummary` | One-line summary from Claude |

```yaml
- script: |
    echo "PR: $(PrUrl)"
    echo "Verdict: $(ReviewVerdict) — $(ReviewTotalIssues) issues"
```

---

## AI providers

Use `aiProvider` to choose where the model runs. All providers host Claude models.

| `aiProvider` | Auth inputs needed |
|---|---|
| `anthropic` (default) | `aiApiKey` |
| `azure` | `aiApiKey`, `aiBaseUrl` |
| `litellm` | `aiBaseUrl`, `aiApiKey` (optional) |
| `bedrock` | `awsRegion` + optionally `awsAccessKeyId` / `awsSecretAccessKey` |
| `vertex` | `gcpProjectId`, `gcpRegion`, GCP ADC credentials |

### Anthropic (default)

```yaml
enableAiReview: true
aiProvider: anthropic
aiApiKey: $(ANTHROPIC_API_KEY)
aiModel: claude-sonnet-4-6
```

### Azure AI Foundry

Find your endpoint in **Azure AI Foundry → Project → Deployments → your model → API endpoint**.

```yaml
enableAiReview: true
aiProvider: azure
aiApiKey: $(AZURE_AI_API_KEY)
aiBaseUrl: $(AZURE_AI_ENDPOINT)   # https://<resource>.services.ai.azure.com/models
aiModel: claude-sonnet-4-6       # deployment name
```

### AWS Bedrock

Enable the model in **AWS Console → Bedrock → Model access** first. On ADO-hosted agents without an IAM role, pass keys explicitly.

```yaml
enableAiReview: true
aiProvider: bedrock
awsRegion: us-east-1
awsAccessKeyId: $(AWS_ACCESS_KEY_ID)          # omit to use IAM role
awsSecretAccessKey: $(AWS_SECRET_ACCESS_KEY)  # omit to use IAM role
aiModel: anthropic.claude-3-5-sonnet-20241022-v2:0
```

Bedrock model ID format: `anthropic.<model>` (or `us.anthropic.<model>` for cross-region inference).

### Google Vertex AI

Enable Claude in **Google Cloud Console → Vertex AI → Model Garden**. Authentication uses Application Default Credentials — set `GOOGLE_APPLICATION_CREDENTIALS` to a service account key file in your pipeline environment.

```yaml
enableAiReview: true
aiProvider: vertex
gcpProjectId: my-gcp-project
gcpRegion: us-east5
aiModel: claude-sonnet-4-6
```

### LiteLLM

Point at your local or remote LiteLLM proxy. The proxy handles model routing.

```yaml
enableAiReview: true
aiProvider: litellm
aiBaseUrl: http://litellm.internal:4000
aiApiKey: $(LITELLM_API_KEY)   # optional — depends on your proxy config
aiModel: claude-sonnet-4-6
```

---

## Model selection

| Model | Speed | Cost (Anthropic) | Best for |
|---|---|---|---|
| `claude-haiku-4-5-20251001` | ⚡ Fast | $0.80 / 1M tokens | High volume, quick feedback |
| `claude-sonnet-4-6` | ◎ Balanced | $3 / 1M tokens | General use (recommended) |
| `claude-opus-4-6` | ◎ Thorough | $15 / 1M tokens | Security, complex or large PRs |

**Rule of thumb:** start with Sonnet. Switch to Haiku if cost matters, Opus if review depth matters.

> AWS Bedrock uses different model IDs — see the Bedrock section above. Pricing on Azure / Bedrock / Vertex may differ from Anthropic direct.

---

## AI review context

Use `aiReviewContext` to focus the review:

```yaml
aiReviewContext: "Focus on security vulnerabilities and breaking API changes."

# or multi-line:
aiReviewContext: |
  This is a database migration PR.
  Focus on: index performance, data integrity, rollback safety.
```

---

## Cost estimates

| Daily PRs | Model | Est. monthly cost |
|---|---|---|
| 20 | Haiku | ~$2 |
| 20 | Sonnet | ~$6 |
| 20 | Opus | ~$45 |

*Assumes avg 1000-line diffs. See [FAQ](./FAQ.md) for detailed pricing.*

---

## See also

- Provider setup: [GitHub](./SETUP_GITHUB.md) · [GitLab](./SETUP_GITLAB.md) · [Bitbucket](./SETUP_BITBUCKET.md) · [ADO](./SETUP_ADO.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [FAQ](./FAQ.md)
