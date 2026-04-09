# Bitbucket Setup Guide

This guide walks you through setting up the AI PR Reviewer plugin to work with Bitbucket Cloud or Bitbucket Server/Data Center repositories on Azure DevOps pipelines.

---

## Prerequisites

- A Bitbucket account (cloud.bitbucket.org or self-hosted instance)
- Azure DevOps project with pipelines enabled
- Bitbucket App Password (Cloud) or Personal Access Token (Server/Data Center)

---

## Bitbucket Cloud Setup

### Step 1: Create an App Password

1. Go to [Bitbucket → Personal Bitbucket settings → App passwords](https://bitbucket.org/account/settings/app-passwords/)
2. Click **Create app password**
3. Fill in:
   - **Label:** `AI PR Reviewer`
   - **Permissions:** Check the following scopes:
     - `account: read` — Read account info
     - `pullrequest: read` — Read pull requests
     - `pullrequest: write` — Create/update pull requests
     - `repository: read` — Read repository contents
4. Click **Create**
5. **Copy the password** — Save it now (you won't see it again)

### Step 2: Configure Azure DevOps

Create secret variables in your variable group:

```yaml
variables:
- group: bitbucket-secrets
```

In the variable group, add:
- `BITBUCKET_APP_PASSWORD`: `[your app password]`
- `BITBUCKET_USERNAME`: `[your Bitbucket username]`

### Step 3: Use in Pipeline

```yaml
steps:
- task: AiPrReviewer@1
  inputs:
    action: createPR
    provider: bitbucket
    accessToken: $(BITBUCKET_USERNAME):$(BITBUCKET_APP_PASSWORD)
    repository: myworkspace/myrepo
    sourceBranch: $(Build.SourceBranchName)
    targetBranch: main
    prTitle: $(Build.SourceBranchName)
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

**Important:** The `accessToken` format is `username:app_password` (colon-separated)

---

## Bitbucket Server / Data Center Setup

### Step 1: Create a Personal Access Token

1. Log in to your Bitbucket Server instance
2. Click your avatar → **Manage account**
3. Go to **Personal access tokens**
4. Click **Create a token**
5. Fill in:
   - **Token name:** `AI PR Reviewer`
   - **Permissions:** Check the following:
     - `REPO_READ` — Read repositories
     - `REPO_WRITE` — Create pull requests & comments
6. Click **Create**
7. **Copy the token** — Save it immediately

### Step 2: Configure Azure DevOps

Create secret variables:

```yaml
variables:
- group: bitbucket-server-secrets
```

In the variable group, add:
- `BITBUCKET_TOKEN`: `[your personal access token]`
- `BITBUCKET_SERVER_URL`: `https://bitbucket.mycompany.com`

### Step 3: Use in Pipeline

```yaml
steps:
- task: AiPrReviewer@1
  inputs:
    action: createPR
    provider: bitbucket-server
    accessToken: $(BITBUCKET_TOKEN)
    serverUrl: $(BITBUCKET_SERVER_URL)
    repository: MYPROJECT/myrepo
    sourceBranch: $(Build.SourceBranchName)
    targetBranch: main
    prTitle: $(Build.SourceBranchName)
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-sonnet-4-6
```

---

## Repository Format

### Bitbucket Cloud

Format: `workspace/repository`

Examples:
- `myworkspace/myrepo`
- `myteam/api-service`

**Note:** Workspace is not the same as username. Find your workspace in [Bitbucket → Settings → Overview](https://bitbucket.org/account/settings/)

### Bitbucket Server / Data Center

Format: `PROJECT_KEY/repository_slug`

Examples:
- `MYPROJ/my-service`
- `PLATFORM/api-gateway`

**Note:** Project key is UPPERCASE (usually an abbreviation). Find it in the project settings or from the URL: `https://bitbucket.mycompany.com/projects/MYPROJ/`

---

## Step: Generate Anthropic API Key

1. Go to [Anthropic Console](https://console.anthropic.com)
2. Sign in or create an account
3. Click **API Keys**
4. **Create key**
5. Name it: `ADO AI PR Reviewer`
6. **Copy the key**
7. Add to Azure DevOps variable group as `ANTHROPIC_API_KEY`

---

## Comparison: Cloud vs Server

| Feature | Cloud | Server/Data Center |
|---|---|---|
| **Auth Type** | App Password + Username | Personal Access Token |
| **Token Format** | `username:password` | `token` |
| **serverUrl Parameter** | Not needed | Required |
| **API Endpoint** | `api.bitbucket.org/2.0` | `https://bitbucket.internal/rest/api/1.0` |
| **Repository Format** | `workspace/repo` | `PROJECT/repo` |
| **Scopes Available** | Limited list | Limited list |
| **Rate Limiting** | Per user account | Per token |

---

## Test Your Setup

### Bitbucket Cloud Test

```yaml
trigger:
  - test-branch

pool:
  vmImage: 'ubuntu-latest'

variables:
- group: bitbucket-secrets

steps:
- task: AiPrReviewer@1
  inputs:
    action: createPR
    provider: bitbucket
    accessToken: $(BITBUCKET_USERNAME):$(BITBUCKET_APP_PASSWORD)
    repository: myworkspace/myrepo
    sourceBranch: test-branch
    targetBranch: main
    prTitle: "Test PR from ADO"
    prDescription: "Testing AI PR Reviewer"
    enableAiReview: true
    aiApiKey: $(ANTHROPIC_API_KEY)
    aiModel: claude-haiku-4-5-20251001

- script: |
    echo "PR URL: $(PrUrl)"
    echo "PR Number: $(PrNumber)"
```

---

## Common Issues & Troubleshooting

### "Invalid credentials" or "401 Unauthorized"

**Cloud Cause:** Username or App Password incorrect

**Cloud Solution:**
1. Verify format: `username:app_password` (with colon)
2. Check App Password is active in [Bitbucket Settings](https://bitbucket.org/account/settings/app-passwords/)
3. Verify permissions include `pullrequest:write`
4. Regenerate App Password if unsure

**Server Cause:** Token invalid, expired, or revoked

**Server Solution:**
1. Verify token exists in [Bitbucket → Personal Access Tokens](https://bitbucket.mycompany.com/plugins/servlet/personal-access-tokens/manage)
2. Check token has `REPO_WRITE` permission
3. Verify `serverUrl` is correct: `https://bitbucket.mycompany.com`
4. Regenerate token and update ADO variable group

### "Repository not found" (404)

**Cloud Cause:** Workspace or repo name wrong

**Cloud Solution:**
1. Verify format: `workspace/repository` (find workspace in settings)
2. Verify you have access to the repository
3. Check repo name matches exactly (case-sensitive)

**Server Cause:** Project key or repo slug wrong

**Server Solution:**
1. Verify format: `PROJECT_KEY/repo_slug` (key is UPPERCASE)
2. Find project key from URL: `...projects/MYPROJ/...`
3. Verify you have access to the project/repo
4. Use lowercase repo slug if unsure

### "Cannot use app password" or "Auth declined"

**Cause:** Wrong permission scopes

**Solution:**
1. Delete the current App Password
2. Create new one with explicit scopes: `account:read`, `pullrequest:read`, `pullrequest:write`, `repository:read`
3. Update ADO variable group

### "Pull request already exists"

**Cause:** PR with same source→target branches exists

**Solution:**
1. Use `failOnExistingPR: false` (default) to reuse existing PR
2. Delete existing PR and retry
3. Use different branch name

### "AI review didn't post"

**Cause:** Diff is empty or API key invalid

**Solution:**
1. Verify source branch has changes vs. target
2. Verify `enableAiReview: true` in task
3. Verify `aiApiKey` is correct
4. Check ADO logs for Anthropic API errors

### "Server URL invalid" (Server only)

**Cause:** URL format incorrect or unreachable

**Solution:**
1. Verify URL: `https://bitbucket.mycompany.com` (no trailing slash, no `/rest/api/1.0`)
2. Test connectivity: `curl https://bitbucket.mycompany.com/rest/api/1.0/version`
3. Verify from ADO pipeline agent (may need proxy/firewall rules)

---

## Security Best Practices

### For Cloud (App Passwords)
1. **Include username prefix** — `username:password` format
2. **Limit scopes** — Grant minimum needed permissions
3. **Rotate regularly** — Delete and recreate every 90 days
4. **Check permissions** — Review scopes in [Settings](https://bitbucket.org/account/settings/app-passwords/) regularly

### For Server / Data Center
1. **Use service accounts** — Create dedicated user for CI/CD
2. **Set expiration** — Tokens should have expiration dates
3. **Limit permissions** — Use `REPO_WRITE` not admin token
4. **Audit token creation** — Check [Audit Log](https://bitbucket.mycompany.com/admin/audit)
5. **Regenerate tokens** — Rotate every 6-12 months

---

## Workspace vs Project Key

### Bitbucket Cloud: Workspace

Not your **username**. Find it in:
- [Bitbucket Settings → Overview](https://bitbucket.org/account/settings/)
- URL: `bitbucket.org/myworkspace/...`
- Ask your workspace admin

### Bitbucket Server: Project Key

Not the project **name**. Find it in:
- Project Settings → Details (look for key field)
- URL: `.../projects/PROJKEY/...`
- Example: `MYPROJ`, `INFRA`, `API`

---

## Next Steps

- See [USER_GUIDE.md](./USER_GUIDE.md) for how to use all three actions
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for error messages and solutions
- See [FAQ.md](./FAQ.md) for cost and performance questions
- See [SETUP_ADO.md](./SETUP_ADO.md) for ADO-specific configuration
