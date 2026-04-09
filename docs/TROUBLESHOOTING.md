# Troubleshooting Guide

This guide helps you identify and fix common errors when using the AI PR Reviewer plugin.

---

## Troubleshooting by Error Type

### Authentication Errors

#### Error: "401 Unauthorized" or "Authentication failed"

**Possible Causes:**
- Token invalid or expired
- Token doesn't have required permissions
- Token is wrong type (classic vs. fine-grained)
- Token isn't being passed correctly to the task

**Steps to Fix:**

1. **Verify token is active:**
   - GitHub: [Settings → Personal access tokens](https://github.com/settings/tokens)
   - GitLab: [Settings → Access Tokens](https://gitlab.com/-/user_settings/personal_access_tokens)
   - Bitbucket Cloud: [Settings → Personal Bitbucket settings → App passwords](https://bitbucket.org/account/settings/app-passwords/)
   - Bitbucket Server: [Atlassian admin → Personal access tokens]

2. **Check token permissions:**
   - GitHub: Must have `repo` or (`contents: read` + `pull_request: write`)
   - GitLab: Must have `api` or (`read_repository` + `write_repository`)
   - Bitbucket Cloud: Must have `pullrequest:read` + `pullrequest:write`
   - Bitbucket Server: Must have `REPO_READ` + `REPO_WRITE`

3. **Verify token in ADO:**
   - Go to **Pipelines → Library → Variable groups**
   - Check variable value matches the token
   - Verify it's marked as secret

4. **Regenerate token if unsure:**
   - Delete old token
   - Create new token with explicit permissions
   - Update ADO variable group

5. **Test in pipeline logs:**
   - Add `System.Debug: true` to see more details
   - But be careful: logs contain masked values

---

#### Error: "Invalid credentials" or "Invalid authentication header"

**Possible Causes:**
- Token format is wrong (e.g., missing `:` for Bitbucket Cloud)
- Credentials not formatted correctly
- Encoding issue

**Steps to Fix (Bitbucket Cloud specific):**

```yaml
# WRONG
accessToken: $(BITBUCKET_APP_PASSWORD)

# CORRECT (with username)
accessToken: $(BITBUCKET_USERNAME):$(BITBUCKET_APP_PASSWORD)
```

---

### Repository/Access Errors

#### Error: "Repository not found" (404)

**Possible Causes:**
- Repository name is wrong
- Repository doesn't exist
- Token can't access repository
- Repository is spelled differently (case-sensitive)

**Steps to Fix:**

1. **Verify repository name format:**
   - GitHub: `owner/repo`
   - GitLab: `group/project` or `group/subgroup/project`
   - Bitbucket Cloud: `workspace/repository`
   - Bitbucket Server: `PROJECT_KEY/repo`

2. **Check repository exists:**
   - Visit repo in browser with your token
   - Verify correct spelling and case
   - Example: `https://github.com/myorg/myrepo`

3. **Verify token has access:**
   - GitHub Classic: Check if you're a collaborator
   - GitLab: Check project/group membership
   - Bitbucket: Check workspace/project access
   - Bitbucket Server: Check project permissions

4. **Check if using correct project key (Bitbucket Server):**
   - Project key is UPPERCASE
   - Find in URL: `.../projects/KEY/...`
   - NOT the project name

---

#### Error: "Fork not found" or "Cannot create PR from this branch"

**Possible Causes:**
- Source or target branch doesn't exist
- Branch naming is wrong
- Trying to create PR to wrong repository

**Steps to Fix:**

1. **Verify branches exist:**
   ```bash
   # GitHub
   curl -H "Authorization: token TOKEN" \
     https://api.github.com/repos/OWNER/REPO/branches/BRANCH_NAME

   # GitLab
   curl -H "PRIVATE-TOKEN: TOKEN" \
     https://gitlab.com/api/v4/projects/PROJECT_ID/repository/branches/BRANCH_NAME
   ```

2. **Check branch names in pipeline:**
   - Use `$(Build.SourceBranchName)` for current branch
   - Verify it doesn't include `refs/heads/` prefix
   - Example: `feature/my-feature` NOT `refs/heads/feature/my-feature`

3. **Verify target branch exists:**
   - Default is `main`, but might be `master` in your repo
   - Check repository settings

---

### PR/MR Creation Errors

#### Error: "PR already exists" or "MR already exists"

**This is not an error** — The plugin detected an existing PR with same source→target branches.

**Default Behavior:**
- Task succeeds and reuses the existing PR
- Sets `failOnExistingPR: false` (default)

**If You Want to Fail:**

```yaml
failOnExistingPR: true  # Task will fail if PR exists
```

**To Fix:**

1. **Option 1: Use existing PR**
   - Set `failOnExistingPR: false` (default)
   - Use output `$(PrUrl)` and `$(PrNumber)` for existing PR

2. **Option 2: Fail on duplicate**
   - Set `failOnExistingPR: true`
   - Close existing PR manually
   - Re-run pipeline

3. **Option 3: Use unique branch names**
   - Use timestamps or build numbers in branch name
   - Example: `feature/my-feature-$(Build.BuildNumber)`

---

### AI Review Errors

#### Error: "AI review didn't post" or "No AI comment on PR"

**Possible Causes:**
- `enableAiReview: false` (not enabled)
- `aiApiKey` is invalid or expired
- Diff is empty (no changes)
- API secret variable not set

**Steps to Fix:**

1. **Verify AI review is enabled:**
   ```yaml
   enableAiReview: true
   ```

2. **Verify Anthropic API key:**
   - Go to [Anthropic Console → API Keys](https://console.anthropic.com/account/keys)
   - Verify key is active and not revoked
   - Check it matches ADO variable group
   - Test with curl:
     ```bash
     curl https://api.anthropic.com/v1/messages \
       -H "x-api-key: YOUR_KEY" \
       -H "anthropic-version: 2023-06-01"
     ```

3. **Verify diff is not empty:**
   - Source branch must have changes vs. target
   - New branch with no commits won't have diff
   - Check: Can you see the PR in browser?

4. **Check ADO variable group:**
   - Go to **Pipelines → Library → Variable groups**
   - Verify `ANTHROPIC_API_KEY` exists
   - Verify value is not empty

5. **Check pipeline logs:**
   - Enable `System.Debug: true`
   - Look for error messages from Anthropic API
   - Check diff is being sent to API

---

#### Error: "Diff was truncated" or "Review incomplete"

**Cause:** Diff exceeded `aiMaxDiffLines` limit (default 500 lines)

**What Happens:**
- Plugin truncates diff at specified line count
- AI review only covers truncated portion
- User sees notice in PR comment

**Steps to Fix:**

```yaml
# Option 1: Increase truncation limit
aiMaxDiffLines: 1000  # Up from default 500

# Option 2: Use stronger model for larger diffs
aiModel: claude-opus-4-6  # Supports more tokens

# Option 3: Split PR into smaller changes
# (Recommended approach)
```

**Best Practice:**
- Keep PRs under 500 lines
- Split large changes into multiple PRs
- This improves review quality, not just AI review

---

#### Error: "Token limit exceeded" or "Context window exceeded"

**Cause:** PR diff + prompt too large for model's token window

**Steps to Fix:**

1. **Reduce diff size:**
   ```yaml
   aiMaxDiffLines: 300  # Smaller limit
   ```

2. **Use more capable model:**
   ```yaml
   aiModel: claude-opus-4-6  # Larger context (200K tokens)
   ```

3. **Remove context:**
   ```yaml
   aiReviewContext: ""  # Clear optional context
   ```

4. **Split the PR:**
   - Create multiple smaller PRs instead
   - Better for human review too

---

### Server/Self-Hosted Errors

#### Error: "Invalid serverUrl" or "Connection refused"

**Cause:** GitLab self-hosted or Bitbucket Server URL is wrong or unreachable

**Steps to Fix:**

1. **Verify URL format:**
   ```yaml
   # GitHub Enterprise (if using GitHub)
   serverUrl: https://github.mycompany.com

   # GitLab self-hosted
   serverUrl: https://gitlab.mycompany.com

   # Bitbucket Server / Data Center
   serverUrl: https://bitbucket.mycompany.com
   ```

   **Important:** No trailing slash, no `/api/` path

2. **Test connectivity from ADO agent:**
   ```bash
   curl https://gitlab.mycompany.com/api/v4/version
   # Should return JSON with version info
   ```

3. **Check firewall/proxy:**
   - ADO agent may need firewall rule
   - May need proxy configuration
   - Contact your IT/Ops team

4. **Verify certificate (for HTTPS):**
   ```bash
   openssl s_client -connect gitlab.mycompany.com:443 -showcerts
   ```

---

#### Error: "SSL certificate verification failed"

**Cause:** Self-signed certificate or certificate chain issue

**Steps to Fix (temporary):**

```yaml
# Note: Not recommended for production
# Contact your infrastructure team instead
```

**Proper Fix:**
- Install proper certificate on self-hosted server
- Or import certificate into agent
- Contact your infrastructure team

---

### Task/Pipeline Errors

#### Error: "Task not found" or "AiPrReviewer@1 task not found"

**Cause:** Extension not installed or disabled

**Steps to Fix:**

1. **Verify extension is installed:**
   - Go to **Extensions** (at organization level)
   - Search for "AI PR Reviewer"
   - Should show "subzone.ad-ai-pr-reviewer"

2. **Verify it's enabled for your project:**
   - Click extension
   - Check project list
   - Your project should be in "Enabled" list

3. **Install if missing:**
   - Go to [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=subzone.ad-ai-pr-reviewer)
   - Click "Get it free"
   - Select your organization
   - Install

4. **Update to latest version:**
   - Go to **Extensions → Manage extensions**
   - Search for "AI PR Reviewer"
   - Click **Update** if available

---

#### Error: "Variable group not found"

**Cause:** Variable group name is wrong or not linked

**Steps to Fix:**

1. **Verify variable group exists:**
   - Go to **Pipelines → Library → Variable groups**
   - Confirm your group is listed

2. **Check spelling in pipeline:**
   ```yaml
   variables:
   - group: pr-review-secrets  # Must match exactly
   ```

3. **Verify group has required variables:**
   - Open the group
   - Check for `GITHUB_PAT`, `ANTHROPIC_API_KEY`, etc.
   - All should be marked as secret

---

### Output Variable Issues

#### Error: "Cannot use $(PrUrl)" in next task

**Cause:** Output variables might not be set if task failed

**Steps to Fix:**

```yaml
- task: AiPrReviewer@1
  name: CreatePR  # Give the task a name
  inputs:
    action: createPR
    # ...

# Use the output in next task
- script: |
    echo "$(CreatePR.PrUrl)"  # Reference by name
    echo "$(CreatePR.PrNumber)"
```

**Note:** Task must succeed for output variables to be set.

---

## Debugging Checklist

If you're stuck, go through this checklist:

### 1. Authentication
- [ ] Token exists and is active
- [ ] Token has correct permissions
- [ ] Token is in AD variable group
- [ ] Variable group is linked to pipeline
- [ ] Variable is marked as secret

### 2. Repository/Access
- [ ] Repository name format is correct
- [ ] Repository is accessible (can you browse it?)
- [ ] Token has access to repository
- [ ] Branches exist (source and target)
- [ ] Branch names have no prefix (no `refs/heads/`)

### 3. Plugin
- [ ] Extension is installed and enabled
- [ ] Task name is exactly `AiPrReviewer@1`
- [ ] All required inputs are filled
- [ ] Provider name is correct (github, gitlab, bitbucket, bitbucket-server)

### 4. AI Review (if enabled)
- [ ] `enableAiReview: true` is set
- [ ] Anthropic API key is valid
- [ ] Diff is not empty
- [ ] Diff size is reasonable (<2000 lines)
- [ ] Model name is correct

### 5. Logs
- [ ] Check task logs for error messages
- [ ] Enable `System.Debug: true` for more details
- [ ] Look for API error messages
- [ ] Check for timeout messages

---

## Getting Help

If you can't find the answer here:

1. **Check GitHub Issues:** [subzone/ad-ai-pr-reviewer/issues](https://github.com/subzone/ad-ai-pr-reviewer/issues)
2. **Read the README:** [README.md](../README.md)
3. **Check USER_GUIDE:** [USER_GUIDE.md](./USER_GUIDE.md)
4. **Provider Guides:**
   - [SETUP_GITHUB.md](./SETUP_GITHUB.md)
   - [SETUP_GITLAB.md](./SETUP_GITLAB.md)
   - [SETUP_BITBUCKET.md](./SETUP_BITBUCKET.md)

---

## Report a Bug

Found an issue? Please report it:

1. Go to [GitHub Issues](https://github.com/subzone/ad-ai-pr-reviewer/issues)
2. Click **New issue**
3. Include:
   - Error message (from task logs)
   - Your provider (GitHub, GitLab, etc.)
   - Steps to reproduce
   - Pipeline YAML (with sensitive values redacted)

This helps us fix bugs faster!
