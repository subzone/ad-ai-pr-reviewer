# Azure DevOps Setup Guide

This guide walks you through setting up the AI PR Reviewer plugin in Azure DevOps for use with your git repositories.

---

## Prerequisites

- Azure DevOps organization and project
- Pipelines enabled
- A connected git repository (GitHub, GitLab, or Bitbucket)
- Admin access to install extensions

---

## Step 1: Install the Extension

1. Go to [Visual Studio Marketplace → AI PR Reviewer](https://marketplace.visualstudio.com/items?itemName=subzone.ad-ai-pr-reviewer)
2. Click **Get it free**
3. Select your **Azure DevOps organization**
4. Click **Install**
5. Confirm installation

### Verify Installation

In your Azure DevOps project, go to **Pipelines → Tasks catalog** and search for "AI PR Reviewer". You should see the task listed.

---

## Step 2: Create Variable Group for Secrets

### Create Variable Group

1. Go to **Pipelines → Library → Variable groups**
2. Click **Create variable group**
3. Name it (e.g., `pr-review-secrets`)

### Add Variables

Add the following variables based on your provider:

#### GitHub Secrets
```
GITHUB_PAT = [your GitHub Personal Access Token]
ANTHROPIC_API_KEY = [your Anthropic API key]
```

#### GitLab Secrets
```
GITLAB_PAT = [your GitLab Personal Access Token]
GITLAB_SERVER_URL = https://gitlab.mycompany.com  # Only if self-hosted
ANTHROPIC_API_KEY = [your Anthropic API key]
```

#### Bitbucket Cloud Secrets
```
BITBUCKET_USERNAME = [your Bitbucket username]
BITBUCKET_APP_PASSWORD = [your Bitbucket App Password]
ANTHROPIC_API_KEY = [your Anthropic API key]
```

#### Bitbucket Server Secrets
```
BITBUCKET_TOKEN = [your Personal Access Token]
BITBUCKET_SERVER_URL = https://bitbucket.mycompany.com
ANTHROPIC_API_KEY = [your Anthropic API key]
```

### Mark as Secret

For each credential variable:
1. Right-click the variable
2. Check **"Keep this value secret"**
3. Click **Update**

**Important:** Secret variables are masked in logs and cannot be viewed after creation.

---

## Step 3: Create or Update Your Pipeline

### Create a New Pipeline

1. Go to **Pipelines → New pipeline**
2. Select your repository source
3. Choose **Existing Azure Pipelines YAML file** (if you have one) or select a template
4. Edit the YAML file (see examples below)

### Link Variable Group to Pipeline

In your `azure-pipelines.yml`, add:

```yaml
trigger:
  - main

variables:
- group: pr-review-secrets   # Reference your variable group

pool:
  vmImage: 'ubuntu-latest'

jobs:
- job: ReviewPullRequests
  steps:
  - task: AiPrReviewer@1
    inputs:
      action: createPR
      # ... more inputs (see examples below)
```

---

## Step 4: Pipeline Examples

### Example 1: Create PR with AI Review (GitHub)

```yaml
trigger:
  - feature/*

variables:
- group: pr-review-secrets

pool:
  vmImage: 'ubuntu-latest'

jobs:
- job: CreatePRWithReview
  displayName: 'Create PR with AI Review'
  steps:
  - task: AiPrReviewer@1
    displayName: 'Create PR and get AI review'
    inputs:
      action: createPR
      provider: github
      accessToken: $(GITHUB_PAT)
      repository: myorg/myrepo
      sourceBranch: $(Build.SourceBranchName)
      targetBranch: main
      prTitle: '$(Build.SourceBranchName): automated PR'
      prDescription: |
        Automated PR created by Azure DevOps pipeline
        Build: $(Build.BuildNumber)
        Branch: $(Build.SourceBranch)
      enableAiReview: true
      aiApiKey: $(ANTHROPIC_API_KEY)
      aiModel: claude-sonnet-4-6
      aiReviewContext: 'Focus on security and breaking changes'

  - script: |
      echo "PR created: $(PrUrl)"
      echo "PR Number: $(PrNumber)"
    displayName: 'Output PR Details'
```

### Example 2: Review Existing PR

```yaml
trigger: none  # Manual trigger

variables:
- group: pr-review-secrets

pool:
  vmImage: 'ubuntu-latest'

jobs:
- job: ReviewExistingPR
  displayName: 'Review an existing PR'
  steps:
  - task: AiPrReviewer@1
    displayName: 'Post AI review on PR'
    inputs:
      action: reviewPR
      provider: github
      accessToken: $(GITHUB_PAT)
      repository: myorg/myrepo
      prNumber: $(System.PullRequest.PullRequestNumber)  # From PR trigger
      enableAiReview: true
      aiApiKey: $(ANTHROPIC_API_KEY)
      aiModel: claude-opus-4-6  # More detailed review
      aiReviewContext: 'Check for bugs, security issues, and code quality'
```

### Example 3: Post Comment on PR

```yaml
trigger: none

variables:
- group: pr-review-secrets

pool:
  vmImage: 'ubuntu-latest'

jobs:
- job: CommentOnPR
  displayName: 'Post comment on PR'
  steps:
  - task: AiPrReviewer@1
    displayName: 'Post build status comment'
    inputs:
      action: commentPR
      provider: github
      accessToken: $(GITHUB_PAT)
      repository: myorg/myrepo
      prNumber: $(System.PullRequest.PullRequestNumber)
      commentBody: |
        ### Build Status: ✅ Passed

        - Tests: All passed
        - Coverage: 85%
        - Build duration: 5m 32s

        Ready for review!
```

---

## Step 5: Trigger Your Pipeline

### Trigger on Branch Push

```yaml
trigger:
  - main
  - feature/*
```

### Trigger on Pull Request

```yaml
pr:
  - main
  - develop

trigger: none  # Disable push trigger
```

### Manual Trigger

```yaml
trigger: none
pr: none

# Users can manually queue the pipeline from the UI
```

### Scheduled Trigger

```yaml
schedules:
- cron: "0 9 * * *"  # Daily at 9 AM
  displayName: Daily review
  branches:
    include:
    - main
```

---

## Step 6: Monitor Execution

### View Pipeline Runs

1. Go to **Pipelines**
2. Select your pipeline
3. Click on a run to see details

### Check Task Output

1. Click on a task in the pipeline run
2. Look for log messages from AI PR Reviewer task
3. View output variables:
   - `PrUrl` — URL of the created/reviewed PR
   - `PrNumber` — PR number

### Debug Issues

Enable debug logging:

```yaml
variables:
  System.Debug: 'true'  # Enables debug output in logs
- group: pr-review-secrets
```

---

## Step 7: Use Output Variables in Downstream Steps

```yaml
steps:
- task: AiPrReviewer@1
  displayName: 'Create PR'
  inputs:
    action: createPR
    # ... inputs ...

# Use output variables in next step
- script: |
    echo "PR URL: $(PrUrl)"
    echo "PR Number: $(PrNumber)"
  displayName: 'Show PR Details'

# Use in condition
- task: SendEmail@1
  displayName: 'Notify on PR creation'
  condition: succeeded()
  inputs:
    body: 'PR created: $(PrUrl)'
```

---

## Common Patterns

### Pattern 1: Create PR + Auto-Merge if Review Passed

```yaml
- task: AiPrReviewer@1
  name: ReviewTask
  inputs:
    action: createPR
    enableAiReview: true
    # ...

- script: |
    # Check if review passed (can add logic here)
    echo "Review complete. PR: $(PrUrl)"
  displayName: 'Check review results'
```

### Pattern 2: Multi-Provider Pipeline

See [`examples/pipeline.yml`](../examples/pipeline.yml) for complete example with GitHub, GitLab, and Bitbucket.

### Pattern 3: Conditional Tasks Based on Branch

```yaml
- task: AiPrReviewer@1
  displayName: 'Create PR (main only)'
  condition: eq(variables['Build.SourceBranch'], 'refs/heads/main')
  inputs:
    action: createPR
    targetBranch: main
```

---

## Common Issues & Troubleshooting

### "Variable group not found"

**Cause:** Variable group name misspelled or not linked

**Solution:**
1. Go to **Pipelines → Library** and verify variable group exists
2. Check spelling in `variables:` section
3. Ensure you have permissions to view variable group

### "Task not found" or "Handler not implemented"

**Cause:** Extension not installed or outdated

**Solution:**
1. Verify extension is installed: **Extensions → Manage extensions**
2. Check extension is enabled for your project
3. Update extension to latest version

### "Build.SourceBranchName is empty"

**Cause:** Using wrong trigger context

**Solution:**
1. For pull request triggers, use `System.PullRequest.*` variables
2. For push triggers, use `Build.SourceBranchName`
3. Debug with: `echo '$(Build.SourceBranchName)'` in a script step

### "Secret variable appears in logs"

**Cause:** Variable not marked as secret

**Solution:**
1. Go to **Pipelines → Library → Variable groups**
2. Edit each credential variable
3. Check **"Keep this value secret"**
4. Click **Update**

Azure DevOps will mask the value in logs after this.

---

## Set-Up Checklist

- [ ] Extension installed from Marketplace
- [ ] Variable group created with secrets
- [ ] All secrets marked as secret
- [ ] Pipeline YAML has `variables: - group: [name]`
- [ ] Task inputs point to correct provider
- [ ] Test pipeline created and runs successfully
- [ ] Output variables used in downstream steps (optional)
- [ ] Monitoring configured (optional alerts/notifications)

---

## Next Steps

- See [SETUP_GITHUB.md](./SETUP_GITHUB.md) for GitHub-specific setup
- See [SETUP_GITLAB.md](./SETUP_GITLAB.md) for GitLab-specific setup
- See [SETUP_BITBUCKET.md](./SETUP_BITBUCKET.md) for Bitbucket setup
- See [USER_GUIDE.md](./USER_GUIDE.md) for using the plugin
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for error solutions
