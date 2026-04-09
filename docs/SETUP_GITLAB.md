# GitLab Setup Guide

This guide walks you through setting up the AI PR Reviewer plugin to work with GitLab repositories (cloud and self-hosted) on Azure DevOps pipelines.

---

## Prerequisites

- A GitLab account (gitlab.com or self-hosted instance)
- Azure DevOps project with pipelines enabled
- GitLab Personal Access Token (PAT) with appropriate permissions

---

## Step 1: Create a GitLab Personal Access Token

### GitLab Cloud (gitlab.com)

1. Go to [GitLab → User menu → Settings → Access Tokens](https://gitlab.com/-/user_settings/personal_access_tokens)
2. Click **Add new token**
3. Fill in:
   - **Token name:** `AI PR Reviewer`
   - **Expiration date:** Select (90 days recommended)
   - **Scopes:** Check the following:
     - `api` ✓ — Full API access (recommended)
     - OR (more restricted):
       - `read_repository` — Read repository contents
       - `write_repository` — Write to repository (for creating MRs)
       - `api` — Full API access
4. Click **Create personal access token**
5. **Copy the token** — Save it now

### GitLab Self-Hosted

1. Log in to your GitLab instance
2. Click **Settings** (avatar) → **Access Tokens**
3. Follow the same steps as cloud GitLab above
4. The token will work with your instance URL

---

## Step 2: Configure Azure DevOps Pipeline

### Create a Secret Variable

In your Azure DevOps project:

1. **Go to Pipelines → Library → Variable groups** (or use pipeline variables)
2. **Create a new variable group** called `gitlab-secrets`
3. **Add variables:**
   - Name: `GITLAB_PAT`
   - Value: `[paste your GitLab token]`
   - Check "Keep this value secret"
4. If using self-hosted GitLab, also add:
   - Name: `GITLAB_SERVER_URL`
   - Value: `https://gitlab.mycompany.com`
5. **Save**

### Link Variable Group to Pipeline

In your `azure-pipelines.yml`:

```yaml
trigger:
  - main

variables:
- group: gitlab-secrets

jobs:
- job: CreateMergeRequest
  pool:
    vmImage: 'ubuntu-latest'
  steps:
  - task: AiPrReviewer@1
    inputs:
      action: createPR
      provider: gitlab
      accessToken: $(GITLAB_PAT)
      repository: mygroup/myproject
      sourceBranch: $(Build.SourceBranchName)
      targetBranch: main
      prTitle: $(Build.SourceBranchName)
      serverUrl: $(GITLAB_SERVER_URL)  # Only needed for self-hosted
      enableAiReview: true
      aiApiKey: $(ANTHROPIC_API_KEY)
      aiModel: claude-sonnet-4-6
```

---

## Step 3: Format Considerations

### Repository Name Format

| Install Type | Format | Example |
|---|---|---|
| **GitLab Cloud** | `group/project` or `group/subgroup/project` | `mygroup/myproject` or `team/platform/api` |
| **Self-Hosted** | `group/project` or `group/subgroup/project` | `mygroup/myproject` |

The repository name is **URL-encoded internally**, so special characters are handled automatically.

---

## Step 4: Cloud vs Self-Hosted

### For GitLab Cloud

```yaml
inputs:
  action: createPR
  provider: gitlab
  accessToken: $(GITLAB_PAT)
  repository: mygroup/myproject
  # serverUrl: NOT NEEDED
```

### For Self-Hosted GitLab

```yaml
inputs:
  action: createPR
  provider: gitlab
  accessToken: $(GITLAB_PAT)
  repository: mygroup/myproject
  serverUrl: https://gitlab.mycompany.com
```

---

## Step 5: Generate Anthropic API Key

1. Go to [Anthropic Console](https://console.anthropic.com)
2. Sign in or create an account
3. Click **API Keys**
4. **Create key**
5. Name it: `ADO AI PR Reviewer`
6. **Copy the key**
7. Add to Azure DevOps variable group as `ANTHROPIC_API_KEY`

---

## Token Permissions Reference

### Scopes Explanation

| Scope | Permission | Needed For |
|---|---|---|
| **api** | Full API access | All actions (recommended) |
| **read_repository** | Read repo files & branches | Reading diffs |
| **write_repository** | Create/update MRs & comments | Creating MRs, posting comments |

**Recommended:** Use `api` scope for simplicity.

---

## Step 6: Test Your Setup

### Create a Test Pipeline

```yaml
trigger:
  - test-branch

pool:
  vmImage: 'ubuntu-latest'

variables:
- group: gitlab-secrets

steps:
- task: AiPrReviewer@1
  inputs:
    action: createPR
    provider: gitlab
    accessToken: $(GITLAB_PAT)
    repository: mygroup/myproject
    sourceBranch: test-branch
    targetBranch: main
    prTitle: "Test MR from ADO"
    prDescription: "Testing AI PR Reviewer"
    serverUrl: $(GITLAB_SERVER_URL)
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-haiku-4-5-20251001

- script: |
    echo "MR URL: $(PrUrl)"
    echo "MR Number: $(PrNumber)"
```

---

## Common Issues & Troubleshooting

### "Authentication failed" or "401 Unauthorized"

**Cause:** Token invalid, expired, or revoked

**Solution:**
1. Verify token is still active: Check [Access Tokens](https://gitlab.com/-/user_settings/personal_access_tokens)
2. Verify token has `api` scope (not just `read_api`)
3. For self-hosted, verify `serverUrl` is correct
4. Regenerate token and update ADO variable group

### "Project not found" (404)

**Cause:** Repository name wrong or token can't access it

**Solution:**
1. Verify format: `group/project` (case-sensitive on some systems)
2. For subgroups: `team/platform/api` (include all levels)
3. Verify token can access project: Visit project URL in browser
4. Check if project is private (token needs access)

### "Merge Request already exists"

**Cause:** MR with same source→target branches exists

**Solution:**
1. Use `failOnExistingPR: false` (default) to reuse existing MR
2. Close the existing MR manually and retry
3. Use different source branch name

### "Diff is empty" or "AI review didn't post"

**Cause:** New MR with no changes, or API key issue

**Solution:**
1. Ensure source branch has actual changes vs. target
2. Verify `enableAiReview: true` is set
3. Verify `aiApiKey` is correct
4. Check ADO logs for Anthropic API errors

### "Invalid serverUrl" (self-hosted only)

**Cause:** URL format incorrect or instance unreachable

**Solution:**
1. Verify URL format: `https://gitlab.mycompany.com` (no trailing slash)
2. Remove path: Don't include `/api/v4/` or `/web/`
3. Test connectivity: `curl https://gitlab.mycompany.com/api/v4/version`
4. Verify network access from ADO pipeline agent

---

## Security Best Practices

1. **Use API scope carefully** — `api` grants broad access
2. **Set expiration dates** — Use 90-day rotations
3. **Store as secret** — Always use `isSecret: true` in ADO
4. **Use project tokens** (GitLab Premium) — More restricted than personal tokens
5. **Audit tokens** — Check [Access Tokens](https://gitlab.com/-/user_settings/personal_access_tokens) regularly
6. **Restrict by IP** (self-hosted) — Configure firewall rules if possible

---

## Token Types in GitLab

### Personal Access Tokens
- Created per user
- Standard option
- Works with any project the user can access

### Project Access Tokens (GitLab Premium)
- Created per project
- More restrictive
- Can't access other projects
- Better for service accounts

**Recommendation:** Use Personal Access Token unless you have GitLab Premium.

---

## Next Steps

- See [USER_GUIDE.md](./USER_GUIDE.md) for how to use all three actions
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for error messages
- See [FAQ.md](./FAQ.md) for cost and performance questions
- See [SETUP_ADO.md](./SETUP_ADO.md) for ADO-specific configuration
