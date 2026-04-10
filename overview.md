# AI PR Reviewer

**Automatic AI code reviews on GitHub, GitLab & Bitbucket — triggered directly from Azure DevOps pipelines.**

No extra servers. No webhooks to configure. One task, three providers, real Claude reviews posted as PR comments.

---

## Quick Start — 3 steps

### Step 1 &nbsp;·&nbsp; Store your secrets

In Azure DevOps → **Pipelines → Library → Variable groups**, create a group (e.g. `ai-reviewer-secrets`) with two secret variables:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `GITHUB_PAT` / `GITLAB_PAT` / `BITBUCKET_PAT` | Your provider's token settings (see [setup guides](https://github.com/subzone/ad-ai-pr-reviewer/tree/main/docs)) |

---

### Step 2 &nbsp;·&nbsp; Pick your provider and copy the pipeline

Click the section for your git host:

<details>
<summary><strong>🐙 GitHub</strong></summary>

```yaml
trigger: none

pr:
  branches:
    include: [main]

variables:
- group: ai-reviewer-secrets   # contains GITHUB_PAT + ANTHROPIC_API_KEY

pool:
  vmImage: ubuntu-latest

steps:
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: github
    accessToken: $(GITHUB_PAT)
    repository: myorg/myrepo          # ← change this
    prNumber: $(System.PullRequest.PullRequestNumber)
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

</details>

<details>
<summary><strong>🦊 GitLab (cloud)</strong></summary>

```yaml
trigger: none

pr:
  branches:
    include: [main]

variables:
- group: ai-reviewer-secrets   # contains GITLAB_PAT + ANTHROPIC_API_KEY

pool:
  vmImage: ubuntu-latest

steps:
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: gitlab
    accessToken: $(GITLAB_PAT)
    repository: mygroup/myproject     # ← change this
    prNumber: $(System.PullRequest.PullRequestNumber)
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

</details>

<details>
<summary><strong>🦊 GitLab (self-hosted)</strong></summary>

```yaml
trigger: none

pr:
  branches:
    include: [main]

variables:
- group: ai-reviewer-secrets   # contains GITLAB_PAT + ANTHROPIC_API_KEY

pool:
  vmImage: ubuntu-latest

steps:
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: gitlab
    accessToken: $(GITLAB_PAT)
    repository: mygroup/myproject             # ← change this
    serverUrl: https://gitlab.mycompany.com   # ← change this
    prNumber: $(System.PullRequest.PullRequestNumber)
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

</details>

<details>
<summary><strong>🪣 Bitbucket Cloud</strong></summary>

```yaml
trigger: none

pr:
  branches:
    include: [main]

variables:
- group: ai-reviewer-secrets   # contains BITBUCKET_APP_PASSWORD + ANTHROPIC_API_KEY

pool:
  vmImage: ubuntu-latest

steps:
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: bitbucket
    accessToken: $(BITBUCKET_APP_PASSWORD)   # format: username:app_password
    repository: myworkspace/myrepo           # ← change this
    prNumber: $(System.PullRequest.PullRequestNumber)
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

> **Bitbucket App Password:** Personal settings → App passwords → Create → enable *Repositories: Read* and *Pull requests: Read & Write*

</details>

<details>
<summary><strong>🏢 Bitbucket Server / Data Center</strong></summary>

```yaml
trigger: none

pr:
  branches:
    include: [main]

variables:
- group: ai-reviewer-secrets   # contains BITBUCKET_PAT + ANTHROPIC_API_KEY

pool:
  vmImage: ubuntu-latest

steps:
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    provider: bitbucket-server
    accessToken: $(BITBUCKET_PAT)
    repository: MYPROJECT/myrepo              # ← PROJECT_KEY/repo-slug
    serverUrl: https://bitbucket.mycompany.com  # ← change this
    prNumber: $(System.PullRequest.PullRequestNumber)
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

</details>

---

### Step 3 &nbsp;·&nbsp; Create the ADO pipeline

1. In Azure DevOps → **Pipelines → New pipeline**
2. Connect to your repository
3. Choose **Existing YAML file** and point to your file
4. Open a pull request → the pipeline runs and posts the AI review

---

## What it does

The task has three actions you can mix and match:

| Action | Input | What happens |
|---|---|---|
| `reviewPR` | PR number | Fetches the diff, sends to Claude, posts structured review comment |
| `createPR` | Source + target branch | Opens a PR on your git host; optionally runs AI review immediately |
| `commentPR` | PR number + text | Posts a custom comment (build results, status, notes) |

---

## AI providers

Choose where to run the model. All providers host Claude models; the only difference is authentication and model naming.

| Provider | `aiProvider` value | Auth needed |
|---|---|---|
| **Anthropic (direct)** | `anthropic` | API key from [console.anthropic.com](https://console.anthropic.com) |
| **Azure AI Foundry** | `azure` | Azure deployment API key + endpoint URL |
| **LiteLLM** | `litellm` | Your proxy URL (API key optional) |
| **AWS Bedrock** | `bedrock` | IAM role or AWS access key + secret + region |
| **Google Vertex AI** | `vertex` | GCP project ID + region + Application Default Credentials |

<details>
<summary><strong>Anthropic (direct API) — default</strong></summary>

```yaml
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    # ... git provider inputs ...
    enableAiReview: true
    aiProvider: anthropic
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

</details>

<details>
<summary><strong>Azure AI Foundry</strong></summary>

Requires a Claude deployment in Azure AI Foundry. Find the endpoint URL in **Azure AI Foundry → Project → Deployments → your model → API endpoint**.

```yaml
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    # ... git provider inputs ...
    enableAiReview: true
    aiProvider: azure
    aiApiKey: $(AZURE_AI_API_KEY)
    aiBaseUrl: $(AZURE_AI_ENDPOINT)      # e.g. https://<resource>.services.ai.azure.com/models
    aiModel: claude-sonnet-4-6           # your deployment name
```

</details>

<details>
<summary><strong>AWS Bedrock</strong></summary>

Enable the Claude model in **AWS Console → Bedrock → Model access** for your target region. Uses IAM role credentials automatically; supply keys only if not running on an EC2/ECS role.

```yaml
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    # ... git provider inputs ...
    enableAiReview: true
    aiProvider: bedrock
    awsRegion: us-east-1
    awsAccessKeyId: $(AWS_ACCESS_KEY_ID)         # optional — leave blank to use IAM role
    awsSecretAccessKey: $(AWS_SECRET_ACCESS_KEY) # optional — leave blank to use IAM role
    aiModel: anthropic.claude-3-5-sonnet-20241022-v2:0
```

> **Bedrock model IDs** use the `anthropic.` prefix. Newer models on cross-region inference use the `us.` / `eu.` prefix (e.g. `us.anthropic.claude-opus-4-5:0`).

</details>

<details>
<summary><strong>Google Vertex AI</strong></summary>

Enable the Claude model in **Google Cloud Console → Vertex AI → Model Garden**. Authentication uses [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials) — set `GOOGLE_APPLICATION_CREDENTIALS` to your service account key file path in the pipeline.

```yaml
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    # ... git provider inputs ...
    enableAiReview: true
    aiProvider: vertex
    gcpProjectId: my-gcp-project
    gcpRegion: us-east5
    aiModel: claude-sonnet-4-6
```

</details>

<details>
<summary><strong>LiteLLM (self-hosted proxy)</strong></summary>

Point the task at your LiteLLM proxy. The proxy handles the actual model routing. API key is optional depending on your proxy configuration.

```yaml
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    # ... git provider inputs ...
    enableAiReview: true
    aiProvider: litellm
    aiBaseUrl: http://litellm.internal:4000   # your proxy URL
    aiApiKey: $(LITELLM_API_KEY)              # optional
    aiModel: claude-sonnet-4-6
```

</details>

---

## Choose a model

All providers support these Claude models (use the exact ID for your provider):

| Model | Speed | Cost (Anthropic) | Best for |
|---|---|---|---|
| `claude-haiku-4-5-20251001` | ⚡ Fast | $0.80 / 1M tokens | High volume, quick feedback |
| `claude-sonnet-4-6` | ◎ Balanced | $3 / 1M tokens | **General use — recommended** |
| `claude-opus-4-6` | ◎ Thorough | $15 / 1M tokens | Security audits, complex changes |

> AWS Bedrock uses different model IDs — see the Bedrock section above. Pricing on Azure / Bedrock / Vertex may differ from Anthropic direct.

Typical cost per PR: **$0.001 – $0.05** depending on diff size and model.

---

## Customize the review focus

Use `aiReviewContext` to tell Claude what to prioritize:

```yaml
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
    aiReviewContext: |
      Focus on security vulnerabilities and breaking API changes.
      Flag any hardcoded credentials or exposed secrets.
    aiMaxDiffLines: 500   # truncate large diffs (default 500)
```

---

## Output variables

After `reviewPR` or `createPR`, downstream steps can read:

| Variable | Value |
|---|---|
| `PrUrl` | Full URL to the PR |
| `PrNumber` | Numeric PR ID |
| `ReviewVerdict` | `lgtm` · `needs-work` · `critical` |
| `ReviewTotalIssues` | Number of issues found |
| `ReviewSummary` | One-line summary from Claude |

```yaml
- script: |
    echo "PR: $(PrUrl)"
    echo "Verdict: $(ReviewVerdict) — $(ReviewTotalIssues) issues"
```

---

## Supported providers

| Provider | Create PR | AI Review | Comment | Self-hosted |
|---|---|---|---|---|
| GitHub | ✅ | ✅ | ✅ | GitHub Enterprise ✅ |
| GitLab | ✅ | ✅ | ✅ | ✅ via `serverUrl` |
| Bitbucket Cloud | ✅ | ✅ | ✅ | — |
| Bitbucket Server / DC | ✅ | ✅ | ✅ | ✅ via `serverUrl` |

---

## Documentation

- [GitHub setup](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/SETUP_GITHUB.md)
- [GitLab setup](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/SETUP_GITLAB.md)
- [Bitbucket setup](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/SETUP_BITBUCKET.md)
- [Azure DevOps setup](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/SETUP_ADO.md)
- [User guide](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/USER_GUIDE.md) — all actions, models, cost estimates
- [Troubleshooting](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/TROUBLESHOOTING.md)
- [FAQ](https://github.com/subzone/ad-ai-pr-reviewer/blob/main/docs/FAQ.md)
- [Source code](https://github.com/subzone/ad-ai-pr-reviewer)

---

**License:** MIT &nbsp;·&nbsp; **Publisher:** [subzone](https://github.com/subzone) &nbsp;·&nbsp; Powered by [Anthropic Claude](https://anthropic.com)
