# Frequently Asked Questions (FAQ)

Quick answers to common questions about the AI PR Reviewer plugin.

---

## General Questions

### What does this plugin do?

It's an Azure DevOps task that creates pull requests and posts AI-generated code review comments on GitHub, GitLab, and Bitbucket. Three main actions:
- **createPR** — Create PR + optionally get AI review
- **reviewPR** — Review existing PR with AI
- **commentPR** — Post manual comments

---

### Which git providers does it support?

✅ **GitHub** (cloud)
✅ **GitLab** (cloud and self-hosted via `serverUrl`)
✅ **Bitbucket Cloud**
✅ **Bitbucket Server / Data Center**

---

### Which AI models can I use?

Only **Claude** (Anthropic). Three models available:
- **Claude Opus 4.6** — Most capable, best for complex reviews
- **Claude Sonnet 4.6** — Balanced, recommended
- **Claude Haiku 4.5** — Fastest, good for high-volume

*We're not licensed to integrate with OpenAI, Gemini, or other AI providers.*

---

### Do you integrate with other AI APIs (OpenAI, etc.)?

Not currently. We use Anthropic's Claude API exclusively.

If you need OpenAI or another provider, please create a [GitHub issue](https://github.com/subzone/ad-ai-pr-reviewer/issues) — we'd consider it!

---

### Is the plugin free?

The plugin itself is free. You pay only for:
- Anthropic API usage (by token count)
- Your Azure DevOps pipeline agents

---

## Setup Questions

### Where do I get tokens/credentials?

| Provider | Token Type | Link |
|---|---|---|
| **GitHub** | Personal Access Token | [github.com/settings/tokens](https://github.com/settings/tokens) |
| **GitLab** | Personal Access Token | [gitlab.com/-/user_settings/personal_access_tokens](https://gitlab.com/-/user_settings/personal_access_tokens) |
| **Bitbucket Cloud** | App Password | [bitbucket.org/account/settings/app-passwords](https://bitbucket.org/account/settings/app-passwords) |
| **Bitbucket Server** | Personal Access Token | Your Bitbucket instance → Settings → Personal access tokens |
| **Anthropic** | API Key | [console.anthropic.com](https://console.anthropic.com) |

---

### What permissions/scopes do I need?

**Minimum scopes:**
- GitHub: `repo` or (`contents: read` + `pull_requests: write`)
- GitLab: `api` or (`read_repository` + `write_repository`)
- Bitbucket Cloud: `pullrequest:read`, `pullrequest:write`, `repository:read`
- Bitbucket Server: `REPO_READ`, `REPO_WRITE`

See provider setup guides for detailed instructions:
- [SETUP_GITHUB.md](./SETUP_GITHUB.md)
- [SETUP_GITLAB.md](./SETUP_GITLAB.md)
- [SETUP_BITBUCKET.md](./SETUP_BITBUCKET.md)

---

### Can I use this with self-hosted GitLab or Bitbucket Server?

**Yes!** Use the `serverUrl` parameter:

```yaml
provider: gitlab
serverUrl: https://gitlab.mycompany.com

# OR

provider: bitbucket-server
serverUrl: https://bitbucket.mycompany.com
```

See:
- [SETUP_GITLAB.md → Cloud vs Self-Hosted](./SETUP_GITLAB.md#step-4-cloud-vs-self-hosted)
- [SETUP_BITBUCKET.md → Bitbucket Server](./SETUP_BITBUCKET.md#bitbucket-server--data-center-setup)

---

## AI Review Questions

### Which Claude model should I use?

**Quick Decision:**
- **Security-critical code** → **Opus** (most thorough)
- **General use** → **Sonnet** (recommended, balanced)
- **High-volume/urgency** → **Haiku** (fast & cost-effective)

See [USER_GUIDE.md → Model Selection](./USER_GUIDE.md#claude-model-selection) for detailed comparison.

---

### Can I customize what the AI looks for?

Yes! Use `aiReviewContext`:

```yaml
aiReviewContext: |
  Focus on:
  - SQL injection risks
  - Missing error handling
  - API contract violations
```

See [USER_GUIDE.md → AI Review Context](./USER_GUIDE.md#ai-review-context) for examples.

---

### How much does AI review cost?

**Approximate costs per PR:**
- **Haiku** (fast): `$0.004` per 1000-line PR
- **Sonnet** (recommended): `$0.015` per 1000-line PR
- **Opus** (thorough): `$0.075` per 1000-line PR

**Example:** 20 PRs/day with Sonnet = ~`$6/month`

See [USER_GUIDE.md → Cost Estimation](./USER_GUIDE.md#cost-estimation) for detailed calculator.

---

### What if the diff is too large?

The plugin truncates at `aiMaxDiffLines` (default: 500 lines).

**Options:**
1. Increase limit (costs more):
   ```yaml
   aiMaxDiffLines: 2000
   ```
2. Use Opus (handles more tokens):
   ```yaml
   aiModel: claude-opus-4-6
   ```
3. Keep PRs smaller (recommended):
   - Best practice for human review too
   - Improves code quality

See [USER_GUIDE.md → Handling Large PRs](./USER_GUIDE.md#handling-large-prs).

---

### Can I use this with scheduled pipelines?

Yes! Example:

```yaml
trigger: none

schedules:
- cron: "0 9 * * 1"  # Monday 9 AM

steps:
- task: AiPrReviewer@1
  inputs:
    action: reviewPR
    prNumber: $(System.PullRequest.PullRequestNumber)
    # ...
```

---

### Can I review multiple PRs in one pipeline?

Yes! You can call the task multiple times or loop:

```yaml
steps:
- task: AiPrReviewer@1
  displayName: 'Review PR 1'
  inputs:
    action: reviewPR
    prNumber: 1

- task: AiPrReviewer@1
  displayName: 'Review PR 2'
  inputs:
    action: reviewPR
    prNumber: 2

# Or with parameterized trigger
- ${{ each pr in parameters.prNumbers }}:
  - task: AiPrReviewer@1
    inputs:
      prNumber: ${{ pr }}
```

---

## Workflow Questions

### Can I make this a required check before merge?

Yes! Set up branch protection rules in your provider:
- GitHub: Settings → Branches → Branch protection rules
- GitLab: Settings → Repository → Protected branches
- Bitbucket: Repository settings → Merge checks

Add a check that AI review comment should be present before merging.

---

### Can I auto-merge if AI review passes?

Not directly (security limitation). But you can:

1. Check AI review in logs
2. Trigger a merge task if conditions met:

```yaml
- task: AiPrReviewer@1
  name: ReviewTask
  inputs:
    action: reviewPR
    # ...

- script: |
    # Logic to parse review and potentially merge
    echo "Review posted. Manual merge recommended."
```

---

### How do I post build results to PR?

Use `commentPR` action:

```yaml
- task: AiPrReviewer@1
  inputs:
    action: commentPR
    provider: github
    accessToken: $(GITHUB_PAT)
    prNumber: $(System.PullRequest.PullRequestNumber)
    commentBody: |
      ### Build Status: ✅ Passed
      - Tests: 245 passed
      - Coverage: 87%
```

---

### Can I review PRs from other people?

Yes! The token just needs permission. The AI review is generic, not user-specific.

---

## Troubleshooting Quick Links

| Issue | Link |
|---|---|
| "Authentication failed" | [TROUBLESHOOTING.md → Auth Errors](./TROUBLESHOOTING.md#authentication-errors) |
| "Repository not found" | [TROUBLESHOOTING.md → Repo Errors](./TROUBLESHOOTING.md#repositoryaccess-errors) |
| "AI review didn't post" | [TROUBLESHOOTING.md → AI Review Errors](./TROUBLESHOOTING.md#ai-review-errors) |
| "Diff too large" | [TROUBLESHOOTING.md → Diff Truncation](./TROUBLESHOOTING.md#error-diff-was-truncated-or-review-incomplete) |
| "Connection refused" | [TROUBLESHOOTING.md → Server Errors](./TROUBLESHOOTING.md#serverself-hosted-errors) |

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for comprehensive error solutions.

---

## Feature Requests

### Can you add support for feature X?

We'd love your feedback! Please create a [GitHub issue](https://github.com/subzone/ad-ai-pr-reviewer/issues) with:
- Description of what you want
- Why it would help
- Use cases

Popular requests we're considering:
- ✅ Batching API (cost savings, currently evaluating)
- ✅ Other AI providers (depends on demand)
- ✅ Review templates (customizable prompts)
- ✅ Summary reports (aggregate stats)

---

## Performance & Scaling

### How fast is AI review?

Typically **30-60 seconds** from API call to comment posted.
- Anthropic API response: 10-20 seconds
- Network overhead: 5-10 seconds
- Posting comment: 5-10 seconds

Actual time varies with model and diff size.

---

### Will this work with 1000 PRs per day?

Technically yes, but:
- Costs may be high ($1-2/day with Sonnet)
- Consider batching API (coming soon)
- Or use Haiku model (cheaper, faster)

For very high volume, we recommend:
1. Use Haiku model
2. Batch operations overnight
3. Review only critical PRs

---

### Can I disable AI review on some PRs?

Yes! Set `enableAiReview: false` per PR:

```yaml
- task: AiPrReviewer@1
  inputs:
    action: createPR
    enableAiReview: ${{ parameters.enableReview }}  # Parameterized
```

Or conditionally:

```yaml
- task: AiPrReviewer@1
  condition: contains(variables['Build.SourceBranch'], 'hotfix')
  inputs:
    enableAiReview: true  # Only on hotfixes
```

---

## Security & Privacy

### Are my code and tokens secure?

Yes. Here's what happens:
1. Token is **never logged** (ADO masks secrets)
2. Code diff is sent **directly to Anthropic**
3. Anthropic may use it for service improvement (configurable)
4. We don't store tokens or diffs

---

### Does Anthropic see my code?

Yes, API calls send the diff to Anthropic to generate reviews.

**Privacy options:**
- Self-hosted instances (Bitbucket,GitLab) keep internal traffic on your network
- GitHub/GitLab Cloud traffic goes via Anthropic API
- Check Anthropic's privacy policy at [anthropic.com/legal](https://www.anthropic.com/legal)

---

### What if I have a secret in my code?

**If AI review posts it:** The secret is already in Git history (exposed).

**Prevention:**
- Scan code before committing (secret leaks)
- Use `.gitignore` to exclude secrets
- Use secret management tools (AWS Secrets, HashiCorp Vault)
- Token shouldn't be in code anyway

---

## Still Have Questions?

- Read the complete guides:
  - [README.md](../README.md)
  - [USER_GUIDE.md](./USER_GUIDE.md)
  - [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

- Provider-specific help:
  - [SETUP_GITHUB.md](./SETUP_GITHUB.md)
  - [SETUP_GITLAB.md](./SETUP_GITLAB.md)
  - [SETUP_BITBUCKET.md](./SETUP_BITBUCKET.md)
  - [SETUP_ADO.md](./SETUP_ADO.md)

- Report a bug: [GitHub Issues](https://github.com/subzone/ad-ai-pr-reviewer/issues)
