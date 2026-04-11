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

### How do I prevent AI hallucinations in reviews?

The plugin includes built-in anti-hallucination safeguards:

**1. Grounding Instructions** — The AI is explicitly told to:
- Only comment on code visible in the diff
- Never reference files or functions not shown
- Use cautious language when uncertain

**2. Intelligent File Selection** (`per-file` mode) — Automatically:
- Skips lock files, minified code, and generated files
- Prioritizes security-critical files (auth, crypto, config)
- Avoids reviewing binary files and build artifacts
- Focuses AI attention on hand-written, important code

**3. Automatic Validation** — After each review, the system checks for:
- Mentions of files not in the diff
- Excessive specific line numbers
- Vague/speculative language
- Disproportionate review length

**4. Validation Warnings** — Watch your pipeline logs for:
```
⚠️  AI Review Validation Warnings:
  - AI mentioned file "helper.ts" which is not in the diff
  - Review contains 6 vague suggestions - may lack grounding
```

**Best practices:**
```yaml
aiReviewMode: per-file    # Enables smart file selection
aiMaxFiles: 10            # Limit to highest-priority files
maxDiffLines: 500         # Prevents overwhelming the AI
aiReviewContext: |        # Provides necessary context
  This uses TypeScript with strict null checks.
  Focus on type safety.
```

See [USER_GUIDE.md → Intelligent File Selection](./USER_GUIDE.md#intelligent-file-selection) for details.

---

### How does file selection work in per-file mode?

When using `aiReviewMode: per-file`, the system intelligently chooses which files to review:

**Automatically Skipped:**
- 📦 Lock files (package-lock.json, yarn.lock, etc.)
- 🔒 Binary files
- 📄 Minified/generated code (.min.js, .bundle.js)
- 🏗️ Build artifacts (dist/**, build/**)
- 📊 Very large files (>2000 lines changed)

**Priority Scoring (0-100):**
- 🔴 **High** (70-100): Security files, auth, crypto, passwords
- 🟠 **Medium** (60-69): Config, infrastructure, migrations
- 🟢 **Normal** (50-59): Core source code
- 🔵 **Low** (<50): Tests, documentation

**Example output:**
```
📋 File Selection Summary:
  Total files in PR: 28
  Selected for review: 10
  Skipped: 18
    - 5 file(s): generated/dependency file
    - 3 file(s): binary file
    - 10 file(s): exceeded max files limit

  Files to review (by priority):
    1. 🔴 src/auth/login.ts (priority: 85, +45/-12)
    2. 🔴 config/database.yml (priority: 75, +8/-3)
    3. 🟠 terraform/main.tf (priority: 65, +120/-5)
```

**Configuration:**
```yaml
aiMaxFiles: 10  # Maximum files to review (default: 10)
```

This ensures the AI focuses on important, hand-written code instead of wasting tokens on lock files or autogenerated content.

See [USER_GUIDE.md → Intelligent File Selection](./USER_GUIDE.md#intelligent-file-selection) for full details.

---

### How much does AI review cost?

**Approximate costs per PR:**
- **Haiku** (fast): `$0.004` per 1000-line PR
- **Sonnet** (recommended): `$0.015` per 1000-line PR
- **Opus** (thorough): `$0.075` per 1000-line PR

**Example:** 20 PRs/day with Sonnet = ~`$6/month`

See [USER_GUIDE.md → Cost Estimation](./USER_GUIDE.md#cost-estimation) for detailed calculator.

---

### What is AI tool calling and when should I use it?

**AI tool calling** allows review agents to read files, search code, and gather context beyond the visible diff.

**Available tools:**
- `read_full_file` - Read complete file contents
- `read_file_section` - Read specific line ranges
- `search_codebase` - Search for patterns
- `list_directory` - List directory contents

**When to enable:**
```yaml
# Complex PRs that reference many files
aiEnableTools: true
aiReviewMode: per-file  # Required
```

**Use cases:**
- ✅ API contract changes (verify callers)
- ✅ Database migrations (check schema usage)
- ✅ Security reviews (trace data flows)
- ✅ Refactoring across files

**Cost impact:**
- Adds 15-25% to token usage on average
- Each tool call: ~500-2000 tokens
- Worth it for complex, high-risk PRs

**Don't use for:**
- ❌ Simple, self-contained changes
- ❌ High-volume routine PRs
- ❌ When speed > thoroughness

**Example output:**
```
🔧 Tool Call: read_full_file({"path":"src/models/User.ts"})
📤 Tool Result: (file contents...)
🛠️  Tool Usage Summary:
  - read_full_file: 2 call(s)
```

See [USER_GUIDE.md → AI Tool Calling](./USER_GUIDE.md#ai-tool-calling) for details.

---

### What are specialized review skills?

**Review skills** (v0.3.5+) are domain-specific AI agents that provide expert analysis:

🔒 **Security** (92%) - SQL injection, XSS, auth bypass, hardcoded credentials
⚡ **Performance** (88%) - N+1 queries, inefficient algorithms, blocking operations
🗄️ **Database** (90%) - Migration safety, missing indexes, data integrity
🔌 **API Design** (82%) - Breaking changes, REST compliance, error handling
♿ **Accessibility** (78%) - WCAG violations, ARIA, keyboard navigation

**Quick setup:**
```yaml
aiReviewMode: per-file       # Required
aiEnableSkills: true
aiSkills: security,performance
aiSkillAutoDetect: true      # Add relevant skills automatically
```

**How they work:**
- Run in **parallel** (85% faster than sequential)
- **Auto-detect** based on file patterns and content
- Use specialized prompts and quality checks
- Quality filtering removes hallucinations (70-80% confidence thresholds)

See [USER_GUIDE.md → Specialized Review Skills](./USER_GUIDE.md#specialized-review-skills) and [USER_GUIDE_SKILLS.md](./USER_GUIDE_SKILLS.md) for comprehensive documentation.

---

### Which skills should I use for my PR?

**Decision tree:**

```yaml
# 1. Security-focused (auth, payments, user data)
aiSkills: security
aiSkillAutoDetect: true

# 2. Database changes (migrations, schema)
aiSkills: security,database
aiSkillAutoDetect: false

# 3. API changes (endpoints, contracts)
aiSkills: security,api
aiSkillAutoDetect: true

# 4. Frontend/UI work
aiSkills: accessibility,security
aiSkillAutoDetect: true

# 5. Comprehensive (high-value PRs)
aiSkills: security,performance,database,api
aiSkillAutoDetect: false
```

**Auto-detection examples:**
- File: `src/auth/login.ts` → Adds **Security** skill
- File: `migrations/add_index.sql` → Adds **Database** skill
- Content: `SELECT * FROM` → Adds **Database** and **Performance** skills

**Performance guidance:**
- **1-2 skills**: Fast, focused (recommended for most PRs)
- **3-4 skills**: Comprehensive, medium speed
- **5 skills**: Maximum coverage, slower

See [USER_GUIDE_SKILLS.md](./USER_GUIDE_SKILLS.md) for detailed recommendations.

---

### How much do skills cost?

Skills increase token usage but provide specialized expertise:

| Configuration | Tokens | Cost (Sonnet) | Use Case |
|---|---|---|---|
| No skills | 50K | $0.75 | Simple PRs |
| 2 skills | 125K | $1.88 | Security-critical |
| 3 skills | 165K | $2.48 | Comprehensive |
| 5 skills | 225K | $3.38 | Mission-critical |

**Example (10 files, 3 skills):**
```
Without skills: $0.50
With skills:    $1.40 (280% increase)
```

**Cost optimization strategies:**
```yaml
# Strategy 1: Selective on main branch only
aiEnableSkills: ${{ eq(variables['Build.SourceBranch'], 'refs/heads/main') }}

# Strategy 2: Auto-detect only (no base skills)
aiSkills: ""
aiSkillAutoDetect: true

# Strategy 3: Limit files
aiMaxFiles: 5
aiEnableSkills: true
```

See [USER_GUIDE_SKILLS.md → Cost Impact](./USER_GUIDE_SKILLS.md#cost-impact) for detailed analysis.

---

### Can I create custom skills?

Not yet. Custom skills are planned for a future release.

**What's coming:**
```json
// .aiprreviewer/skills/hipaa-compliance.json
{
  "name": "HIPAA Compliance",
  "focus": "Protected Health Information handling",
  "systemPrompt": "You are a HIPAA expert...",
  "filePatterns": ["**/patient/**"],
  "testCases": [...]
}
```

**Usage (future):**
```yaml
aiSkills: security,.aiprreviewer/skills/hipaa-compliance.json
```

[Create a GitHub issue](https://github.com/subzone/ad-ai-pr-reviewer/issues) if you'd like to see this feature sooner!

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

### How do I track token usage and costs?

Every review automatically logs token usage and costs:

```
💰 Token Usage — Standard Review:
  Model: claude-sonnet-4-6
  Input tokens: 3,245
  Output tokens: 876
  Total tokens: 4,121
  Estimated cost: $0.0222
```

**Access via pipeline variables:**
```yaml
- script: |
    echo "Tokens: $(ReviewTotalTokens)"
    echo "Cost: \$$(ReviewEstimatedCost)"
```

**Available variables:**
- `ReviewInputTokens`, `ReviewOutputTokens`, `ReviewTotalTokens`
- `ReviewEstimatedCost` (in dollars)
- `ReviewModel`
- `ReviewCacheReadTokens`, `ReviewCacheCreationTokens` (if caching used)

See [USER_GUIDE.md → Token Usage & Cost Tracking](./USER_GUIDE.md#token-usage--cost-tracking) for monitoring examples.

---

### Can I see the AI's reasoning process?

Yes! Enable `aiEnableReasoning` to see how the AI analyzes your code:

```yaml
enableAiReview: true
aiEnableReasoning: true
```

**You get three levels of insight:**

1. **Extended Thinking** - Raw AI reasoning:
```
🧠 AI Reasoning — File: src/auth.ts:
--- Thought 1 ---
Examining password validation changes...
```

2. **Structured Analysis** - Multi-phase breakdown:
```
📊 Structured Analysis — src/auth.ts:

[Initial Scan]
  Observation: New regex pattern for passwords
  Conclusion: Security-relevant change

[Security Analysis]
  Observation: Pattern only checks length
  Conclusion: Missing complexity requirements
```

3. **JSON Findings** - Structured output with citations:
```json
{
  "severity": "high",
  "category": "security",
  "title": "Weak password validation",
  "diffLines": "+  const valid = /^.{8,}$/.test(pwd);",
  "suggestion": "Add character class requirements"
}
```

**Benefits:**
- ✅ Deterministic structured output (not free-form text)
- ✅ Every finding cites actual diff lines
- ✅ Multi-step reasoning shows how AI reaches conclusions
- ✅ Automatic validation prevents hallucinations

**Trade-offs:**
- ⚠️ Increases token usage by ~20-30% (minimum 1024 thinking tokens per API call)

**Use cases:**
- Debug AI decisions (why it flagged/missed something)
- Audit trail for compliance
- Improve your `aiReviewContext` prompts
- Production use requiring transparency

See [USER_GUIDE.md → AI Reasoning Output](./USER_GUIDE.md#ai-reasoning-output).

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
