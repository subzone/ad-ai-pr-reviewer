# GitHub Setup Guide

This guide walks you through setting up the AI PR Reviewer plugin to work with GitHub repositories on Azure DevOps pipelines.

---

## Prerequisites

- A GitHub repository (cloud.github.com)
- Azure DevOps project with pipelines enabled
- GitHub Personal Access Token (PAT) with appropriate permissions

---

## Step 1: Create a GitHub Personal Access Token

### Classic Token (Legacy)

If you're using classic tokens:

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Name it: `AI PR Reviewer`
4. Select scopes:
   - `repo` — Full control of private repositories
   - OR (Fine-grained, more restrictive):
     - `contents: read` — Read repository contents
     - `pull_requests: write` — Create/update pull requests
5. Click **Generate token**
6. **Copy the token** — You won't see it again

### Fine-Grained Token (Recommended for Security)

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **Generate new token**
3. Fill in:
   - **Token name:** `AI PR Reviewer`
   - **Expiration:** 90 days (or as per your policy)
   - **Resource owner:** Your organization or personal account
   - **Repository access:** Select repositories (choose the repos that need this)
4. Under **Permissions**, set:
   - **Contents:** Read & write
   - **Pull requests:** Read & write
5. Click **Generate token**
6. **Copy the token**

---

## Step 2: Configure Azure DevOps Pipeline

### Create a Secret Variable

In your Azure DevOps project:

1. **Go to Pipelines → Library → Variable groups** (or use pipeline variables)
2. **Create a new variable group** called `github-secrets` (or add to existing group)
3. **Add variable:**
   - Name: `GITHUB_PAT`
   - Value: `[paste your GitHub token]`
   - Check "Keep this value secret"
4. **Save**

### Link Variable Group to Pipeline

In your `azure-pipelines.yml`:

```yaml
trigger: none

pr:
  branches:
    include: [main]

variables:
- group: github-secrets  # Reference your variable group

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

---

## Step 3: Generate Anthropic API Key

1. Go to [Anthropic Console](https://console.anthropic.com)
2. Sign in or create an account
3. Click **API Keys**
4. **Create key**
5. Name it: `ADO AI PR Reviewer`
6. **Copy the key**
7. Add to Azure DevOps variable group as `ANTHROPIC_API_KEY`

---

## Token Permissions Reference

### For `createPR` action
- `contents: read` — Read repository files and branches
- `pull_requests: write` — Create pull requests

### For `reviewPR` action
- `pull_requests: read` — Read PR details and diffs
- `pull_requests: write` — Post comments on PRs

### For `commentPR` action
- `pull_requests: write` — Post comments on PRs

**Recommended:** Use `repo` scope (classic) or `contents: read + pull_requests: write` (fine-grained) for all actions.

---

## Step 4: Test Your Setup

### Create a Test Pipeline

Create a simple `test-pr-pipeline.yml` referencing an open PR to verify everything works:

```yaml
trigger: none

parameters:
- name: prNumber
  displayName: PR Number to review
  type: number
  default: 1

pool:
  vmImage: ubuntu-latest

variables:
- group: github-secrets

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
    aiModel: claude-haiku-4-5-20251001   # Fastest for testing

- script: |
    echo "Verdict: $(ReviewVerdict)"
    echo "Issues:  $(ReviewTotalIssues)"
    echo "PR URL:  $(PrUrl)"
  displayName: Show review results
```

Run it via **Pipelines → Run pipeline → enter a real PR number**.

---

## Common Issues & Troubleshooting

### "Authentication failed" or "401 Unauthorized"

**Cause:** Token is invalid, expired, or doesn't have required scopes

**Solution:**
1. Verify the token exists: `curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user`
2. Check token scopes in [GitHub Settings → Personal access tokens](https://github.com/settings/tokens)
3. Regenerate the token if unsure
4. Verify it's set correctly in ADO variable group

### "Repository not found" (404)

**Cause:** Repository name is wrong or token can't access it

**Solution:**
1. Verify format: `owner/repo` (case-sensitive)
2. Verify token can access the repo: Add token as collaborator if private repo
3. Check if repo is under an organization (use org name, not your personal name)

### "PR already exists"

**Cause:** A PR with those source→target branches already exists

**Solution:**
1. Use `failOnExistingPR: false` (default) to reuse existing PR instead of failing
2. Change source branch name to make it unique
3. Use `Create PR` without condition to replace old PRs

### "AI review didn't post"

**Cause:** `enableAiReview: true` not set, or API key invalid

**Solution:**
1. Verify `enableAiReview: true` in task inputs
2. Verify `aiApiKey` is set to your Anthropic API key
3. Check ADO pipeline logs for API errors
4. Ensure diff is not empty (new branch with no changes won't generate review)

### "Diff too large" or review seems incomplete

**Cause:** Large PR diff causes token limit issues

**Solution:**
1. Adjust `aiMaxDiffLines` parameter (default 500, try 1000 for large PRs)
2. Use `claude-opus-4-6` for larger diffs (supports more tokens)
3. Create multiple smaller PRs instead of one large one

---

## Security Best Practices

1. **Use fine-grained tokens** — More secure than classic tokens
2. **Limit token scope** — Don't grant `admin` or `repo` scope if not needed
3. **Store in secret variables** — Always use `isSecret: true` in ADO
4. **Rotate tokens regularly** — Set expiration dates (90 days recommended)
5. **Audit usage** — Check GitHub token usage in [Settings → Security log](https://github.com/settings/security-log)
6. **Use separate tokens per service** — Create one token per tool (ADO, CI/CD, etc.)

---

## Example: Complete Pipeline with Multiple Providers

If you want to test GitHub alongside other providers, see [`examples/pipeline.yml`](../examples/pipeline.yml) in the repo.

---

## Next Steps

- See [USER_GUIDE.md](./USER_GUIDE.md) for how to use all three actions
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for error messages and solutions
- See [FAQ.md](./FAQ.md) for cost and performance questions
