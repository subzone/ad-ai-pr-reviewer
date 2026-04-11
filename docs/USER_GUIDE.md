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

**Advanced: with reasoning and cost tracking:**

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
    aiEnableReasoning: true           # Show AI's thought process in logs
    aiReviewContext: |
      Focus on security and performance.
      This repo handles sensitive user data.

- script: |
    echo "=== AI Review Results ==="
    echo "Verdict: $(ReviewVerdict)"
    echo "Issues found: $(ReviewTotalIssues)"
    echo ""
    echo "=== Token Usage & Cost ==="
    echo "Model: $(ReviewModel)"
    echo "Input tokens: $(ReviewInputTokens)"
    echo "Output tokens: $(ReviewOutputTokens)"
    echo "Total tokens: $(ReviewTotalTokens)"
    echo "Estimated cost: \$$(ReviewEstimatedCost)"
    echo ""
    
    # Optional: Warn if cost exceeds threshold
    if [ $(echo "$(ReviewEstimatedCost) > 0.05" | bc) -eq 1 ]; then
      echo "##[warning]Review cost exceeded \$0.05"
    fi
  displayName: 'Review Summary & Cost Report'
```

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
| `ReviewHasWarnings` | `true` if validation warnings detected, `false` otherwise |
| `ReviewWarningCount` | Number of validation warnings (anti-hallucination checks) |
| `ReviewInputTokens` | Total input tokens used |
| `ReviewOutputTokens` | Total output tokens used |
| `ReviewTotalTokens` | Total tokens used (input + output) |
| `ReviewEstimatedCost` | Estimated cost in dollars (e.g., `0.0042`) |
| `ReviewModel` | Model used for the review |
| `ReviewCacheReadTokens` | Cache read tokens (if prompt caching was used) |
| `ReviewCacheCreationTokens` | Cache creation tokens (if prompt caching was used) |

```yaml
- script: |
    echo "PR: $(PrUrl)"
    echo "Verdict: $(ReviewVerdict) — $(ReviewTotalIssues) issues"
    echo "Validation warnings: $(ReviewWarningCount)"
    echo "Tokens used: $(ReviewTotalTokens) (input: $(ReviewInputTokens), output: $(ReviewOutputTokens))"
    echo "Estimated cost: \$$(ReviewEstimatedCost)"
    
    # Optional: Fail the pipeline if too many validation warnings
    if [ "$(ReviewWarningCount)" -gt 3 ]; then
      echo "##[error]Too many validation warnings detected"
      exit 1
    fi
    
    # Optional: Track costs across PRs
    echo "Total review cost for this PR: \$$(ReviewEstimatedCost)"
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

### AI Reasoning Output

Enable `aiEnableReasoning` to see the AI's thought process in your pipeline logs:

```yaml
enableAiReview: true
aiEnableReasoning: true
```

When enabled, the AI will show its reasoning for each file review in the logs:

```
🧠 AI Reasoning — File: src/auth/login.ts:

--- Thought 1 ---
I need to examine the authentication changes carefully. The diff shows
a new password validation function being added. Let me check if there
are any security considerations...
--- End reasoning ---
```

**Trade-offs:**
- ✅ **Benefits**: Better transparency, understand AI decisions, debug unexpected reviews
- ⚠️ **Costs**: Increases token usage by ~20-30%

**When to use:**
- Debugging why AI flagged/missed something
- Understanding AI's analysis approach
- Training/improving your review context
- Production debugging (can be enabled/disabled per pipeline run)

---

## Anti-Hallucination Safeguards

The AI reviewer includes multiple validation layers to prevent hallucinations and ensure review quality:

### 1. Grounding Instructions
The AI is explicitly instructed to:
- **Only comment on code visible in the diff** (lines starting with + or -)
- **Never reference files, functions, or code not shown in the diff**
- **Not make assumptions** about code outside the visible changes
- **Use cautious language** ("Verify that..." instead of stating assumptions as facts)

### 2. Automated Validation Checks
After each review, the system automatically validates the AI's output:

- **File Citation Verification**: Detects if the AI mentioned files not present in the diff
- **Line Number Detection**: Flags excessive specific line references (potential hallucination)
- **Vague Comment Detection**: Identifies speculative language ("might", "could", "possibly") that may indicate uncertainty
- **Length Proportionality**: Warns if the review is disproportionately long for the diff size
- **Hallucination Markers**: Catches phrases like "as mentioned earlier" or "based on existing code" when referring to unseen context

### 3. Validation Warnings
When validation detects potential issues, warnings are logged:

```
⚠️  AI Review Validation Warnings:
  - AI mentioned file "src/helper.ts" which is not in the diff
  - AI provided 8 specific line references - verify accuracy
```

These warnings are also included in the `ReviewResult.validationWarnings` field, allowing you to:
- Monitor hallucination patterns
- Implement custom handling (e.g., skip posting if warnings exceed threshold)
- Include warnings in PR comments for transparency

### Best Practices

**To minimize hallucinations:**
1. Use `aiReviewContext` to provide necessary context about the codebase
2. Keep diffs focused and under 500 lines when possible
3. Use `reviewMode: per-file` for large PRs (reduces context confusion)
4. Monitor validation warnings in your pipeline logs

**Example with validation handling:**
```yaml
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: github
    enableAiReview: true
    reviewMode: per-file  # Reduces hallucination risk for large PRs
    maxDiffLines: 500     # Limits context to prevent overwhelming the AI
    aiReviewContext: |    # Provides grounding context
      This repository uses TypeScript with strict null checks.
      Focus on type safety and null handling.
```

---

## Token Usage & Cost Tracking

Every AI review automatically tracks and reports token usage and costs in your pipeline logs:

```
💰 Token Usage — Standard Review:
  Model: claude-sonnet-4-6
  Input tokens: 3,245
  Output tokens: 876
  Total tokens: 4,121
  Estimated cost: $0.0222
```

### Pipeline Variables

Access token usage via output variables:

```yaml
- script: |
    echo "Tokens: $(ReviewTotalTokens)"
    echo "Cost: \$$(ReviewEstimatedCost)"
    
    # Track cumulative costs
    TOTAL_COST=$(echo "$(ReviewEstimatedCost) + ${ACCUMULATED_COST:-0}" | bc)
    echo "##vso[task.setvariable variable=ACCUMULATED_COST]$TOTAL_COST"
    echo "Total PR review costs today: \$$TOTAL_COST"
```

### Cost Monitoring Examples

**Set cost limits:**
```yaml
- script: |
    if [ $(echo "$(ReviewEstimatedCost) > 0.10" | bc) -eq 1 ]; then
      echo "##[warning]Review cost exceeded $0.10 threshold"
    fi
```

**Track by model:**
```yaml
- script: |
    echo "Model used: $(ReviewModel)"
    echo "Cost: \$$(ReviewEstimatedCost)"
    # Send to your cost tracking system
    curl -X POST https://your-api.com/costs \
      -d "model=$(ReviewModel)" \
      -d "cost=$(ReviewEstimatedCost)" \
      -d "tokens=$(ReviewTotalTokens)"
```

### Per-File Mode Token Aggregation

In per-file mode, token usage is automatically aggregated across all API calls (individual file reviews + synthesis):

```
💰 Token Usage — Per-File Review (Total):
  Model: claude-sonnet-4-6
  Input tokens: 8,432  # Sum of all calls
  Output tokens: 2,105
  Total tokens: 10,537
  Estimated cost: $0.0567
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
