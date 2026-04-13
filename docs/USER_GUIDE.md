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

**Advanced: with reasoning, inline comments, and cost tracking:**

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
    aiEnableInlineComments: true      # Post findings as inline code comments with suggestions
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

Use `aiProvider` to choose where the model runs.

| `aiProvider` | Models | Auth inputs needed |
|---|---|---|
| `anthropic` (default) | Claude | `aiApiKey` |
| `azure` | Claude (AI Foundry) or GPT/O-series (OpenAI) | `aiApiKey`, `aiBaseUrl` |
| `litellm` | Any (proxy-routed) | `aiBaseUrl`, `aiApiKey` (optional) |
| `bedrock` | Claude | `awsRegion` + optionally `awsAccessKeyId` / `awsSecretAccessKey` |
| `vertex` | Claude | `gcpProjectId`, `gcpRegion`, GCP ADC credentials |
| `googleai` | Gemini | `aiApiKey` |
| `githubmodels` | GPT, Llama, Mistral, and others | `aiApiKey` (GitHub PAT) |

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

### Azure OpenAI Service

Find your endpoint and key in **Azure Portal → your OpenAI resource → Keys and Endpoint**.

The model name must match your deployment name in Azure OpenAI Studio. GPT and O-series model names (`gpt-4o`, `o1`, etc.) are automatically detected and routed to Azure OpenAI; Claude model names continue to use Azure AI Foundry.

```yaml
enableAiReview: true
aiProvider: azure
aiApiKey: $(AZURE_OPENAI_API_KEY)
aiBaseUrl: $(AZURE_OPENAI_ENDPOINT)  # https://<resource>.openai.azure.com
aiModel: gpt-4o                      # must match your deployment name
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

### Google AI Studio

Get an API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). No endpoint URL needed — it's fixed.

```yaml
enableAiReview: true
aiProvider: googleai
aiApiKey: $(GOOGLE_AI_STUDIO_KEY)
aiModel: gemini-2.0-flash   # or gemini-1.5-pro, gemini-2.5-pro-preview-03-25
```

### GitHub Models

Create a GitHub Personal Access Token with the `models:read` permission. Browse available models at [github.com/marketplace/models](https://github.com/marketplace/models). No endpoint URL needed — it's fixed.

```yaml
enableAiReview: true
aiProvider: githubmodels
aiApiKey: $(GITHUB_PAT)
aiModel: gpt-4o   # or gpt-4o-mini, Meta-Llama-3.1-405B-Instruct, etc.
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

## Intelligent File Selection

When using `aiReviewMode: per-file`, the system intelligently selects which files to review based on priority and relevance.

### How It Works

1. **Automatic Filtering** - Skips files that shouldn't be reviewed:
   - 📦 Lock files (package-lock.json, yarn.lock, Gemfile.lock, etc.)
   - 🔒 Binary files
   - 📄 Generated/minified files (.min.js, .bundle.js, .map files)
   - 📊 Very large files (>2000 lines changed)
   - 🏗️ Build artifacts (dist/**, build/**, out/**)

2. **Priority-Based Selection** - Reviews most important files first:
   - 🔴 **High Priority** (70-100): Security files, auth, crypto, passwords
   - 🟠 **Medium Priority** (60-69): Config, infrastructure, migrations
   - 🟢 **Normal Priority** (50-59): Core source code
   - 🔵 **Low Priority** (<50): Tests, documentation

3. **Smart Reporting** - Shows what was selected and why:
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
    4. 🟢 src/api/users.ts (priority: 60, +33/-8)
    ...
```

### Default Skip Patterns

Files matching these patterns are automatically skipped:

- **Lock files:** `package-lock.json`, `yarn.lock`, `Gemfile.lock`, `Cargo.lock`, `composer.lock`, `pnpm-lock.yaml`
- **Minified:** `*.min.js`, `*.min.css`, `*.bundle.js`
- **Source maps:** `*.js.map`, `*.css.map`
- **Build artifacts:** `dist/**`, `build/**`, `out/**`, `target/**`, `.next/**`
- **Dependencies:** `node_modules/**`, `vendor/**`, `.bundle/**`
- **Generated docs:** `CHANGELOG.md` (auto-generated), `*.generated.*`

### Default Priority Patterns

Files matching these patterns get higher priority:

- **Security (priority +30):** `**/auth/**`, `**/security/**`, `**/password*`, `**/crypto*`, `**/*.secrets.*`
- **Infrastructure (priority +20):** `*.tf` (Terraform), `*.tfvars`, `docker-compose.yml`, `Dockerfile`
- **Config (priority +15):** `*.config.*`, `*.env.*`, `.env`, `settings.py`
- **Database (priority +15):** `**/migrations/**`, `**/schema/**`, `*.sql`

### Configuration

Control file selection behavior:

```yaml
- task: AiPrReviewer@1
  inputs:
    aiReviewMode: per-file
    aiMaxFiles: 10              # Maximum files to review (default: 10)
```

**Example output:**
```
Files to review (by priority):
  1. 🔴 src/auth/password.ts (priority: 90, +25/-8)
  2. 🔴 config/security.yml (priority: 80, +12/-3)
  3. 🟠 infrastructure/main.tf (priority: 65, +45/-12)
```

> **Note:** File selection happens automatically. You cannot currently customize skip/priority patterns, but this may be added in a future version based on user feedback.

---

## AI Tool Calling

When using `per-file` review mode, you can enable **AI tool calling** to allow agents to gather additional context beyond the visible diff.

### What Are Tools?

Tools are functions the AI can call to:
- 📖 **read_full_file** - Read complete file contents for broader context
- 📄 **read_file_section** - Read specific line ranges from files
- 🔍 **search_codebase** - Search for patterns across the repository
- 📁 **list_directory** - List contents of directories

### When to Enable

**Enable tools when:**
- ✅ Reviewing complex changes that reference many other files
- ✅ You want AI to verify if tests exist for changed code
- ✅ Changes interact with code in other files
- ✅ Security review needs to check external dependencies

**Don't enable tools when:**
- ❌ PRs are simple and self-contained
- ❌ Token costs are a primary concern
- ❌ You need fast turnaround

### Configuration

```yaml
- task: AiPrReviewer@1
  inputs:
    enableAiReview: true
    aiReviewMode: per-file       # Required for tools
    aiEnableTools: true          # Enable tool calling
```

**Example output with tools:**
```
🔧 Tool Call [src/api/users.ts]: read_full_file({"path":"src/models/User.ts"})
📤 Tool Result: File: src/models/User.ts

   1: export interface User {
   2:   id: string;
   3:   email: string;
   ...

🛠️  Tool Usage Summary [src/api/users.ts]:
  - read_full_file: 2 call(s)
  - search_codebase: 1 call(s)
```

### How It Works

1. **Agent analyzes diff** - Starts with visible changes
2. **Identifies gaps** - Determines if additional context needed
3. **Calls tools** - Requests specific files or searches
4. **Receives results** - Gets tool output (truncated if large)
5. **Continues analysis** - Uses tool results to enhance review
6. **Returns findings** - Final structured JSON output

**Limits:**
- Maximum 5 tool iterations per file (prevents runaway costs)
- Tool results truncated at 5KB per call
- Only allows access to repository files (security sandbox)

### Cost Impact

Tool calling increases token usage:
- **Per tool call:** ~500-2000 tokens depending on result size
- **Average increase:** 15-25% total cost for typical PRs
- **Worst case:** 50-100% increase for complex PRs with many tool calls

**Example:**
- Without tools: 50K tokens = $0.75 (Sonnet)
- With tools (3 calls): 65K tokens = $0.98 (Sonnet)

### Best Practices

```yaml
# Security-sensitive PRs - enable tools
enableAiReview: true
aiReviewMode: per-file
aiEnableTools: true
aiReviewContext: |
  This changes authentication logic.
  Verify all callers are updated.

# High-volume PRs - disable tools for speed
enableAiReview: true
aiReviewMode: per-file
aiEnableTools: false
```

**When tools help most:**
- API contract changes
- Database migrations
- Security-critical code
- Refactoring across multiple files

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

**With structured reasoning enabled, you'll see:**

1. **Extended Thinking** - AI's internal reasoning process:
```
🧠 AI Reasoning — File: src/auth/login.ts:
--- Thought 1 ---
Analyzing authentication flow changes...
```

2. **Structured Analysis Steps** - Multi-phase analysis:
```
📊 Structured Analysis — src/auth/login.ts:

[Initial Scan]
  Observation: Added password validation function with regex pattern
  Conclusion: New security-related code requires verification

[Security Analysis]
  Observation: Regex pattern /^.{8,}$/ only checks length, not complexity
  Conclusion: Weak password validation - missing character requirements

[Pattern Detection]
  Observation: No error handling for regex execution
  Conclusion: Could throw on malformed input
```

3. **Structured Findings** - JSON format with mandatory citations:
```json
{
  "severity": "high",
  "category": "security",
  "title": "Weak password validation",
  "description": "Password regex only checks length, not complexity",
  "file": "src/auth/login.ts",
  "diffLines": "+  const isValid = /^.{8,}$/.test(password);",
  "suggestion": "Use stronger regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$/"
}
```

**Key Benefits:**
- ✅ **Deterministic analysis**: Structured JSON output instead of free-form text
- ✅ **Mandatory citations**: Every finding must reference actual diff lines
- ✅ **Multi-step reasoning**: See how AI reaches conclusions
- ✅ **Validation**: Automatic verification that cited lines exist in diff
- ✅ **Reduced hallucinations**: Structure enforces grounding in visible code

**Trade-offs:**
- ⚠️ **Costs**: Increases token usage by ~20-30% (minimum 1024 thinking tokens per API call)

**When to use:**
- Debugging why AI flagged/missed something
- Understanding AI's analysis approach
- Production use - provides audit trail of AI decisions
- High-stakes reviews requiring transparency

---

## Specialized Review Skills

**New in v0.3.5+**: Enable domain-specific expert reviewers for comprehensive code analysis.

### Quick Start

```yaml
enableAiReview: true
aiReviewMode: per-file           # Required for skills
aiEnableSkills: true
aiSkills: security,performance   # Comma-separated skill IDs
aiSkillAutoDetect: true          # Auto-add relevant skills
```

### Available Skills

| Skill | Quality | Focus | Use For |
|---|---|---|---|
| 🔒 **security** | 92% | SQL injection, XSS, auth bypass, credentials | Auth, payments, user data |
| ⚡ **performance** | 88% | N+1 queries, inefficient algorithms, blocking ops | DB queries, loops, real-time |
| 🗄️ **database** | 90% | Migration safety, indexes, data integrity | Migrations, schema changes |
| 🔌 **api** | 82% | Breaking changes, REST design, validation | Endpoints, routes, GraphQL |
| ♿ **accessibility** | 78% | WCAG compliance, ARIA, keyboard nav | UI components, forms |

### How It Works

1. **Parallel Execution**: 3 files processed simultaneously, all skills run in parallel per file
2. **Auto-Detection**: Matches file patterns (`**/auth/**` → security) and content (`SELECT` → database)
3. **Quality Filtering**: Validates citations, confidence (70-80% thresholds), removes hallucinations
4. **Performance**: 85% faster than sequential (17s vs 150s for 10 files × 3 skills)

### Configuration Examples

**Security-focused (recommended for most PRs):**
```yaml
aiSkills: security
aiSkillAutoDetect: true          # Add database/api/etc as needed
```

**Comprehensive (high-value PRs):**
```yaml
aiSkills: security,performance,database,api
aiSkillAutoDetect: false
```

**Cost-optimized (only relevant skills):**
```yaml
aiSkills: ""                     # No base skills
aiSkillAutoDetect: true          # Add only what matches
```

**Branch-conditional:**
```yaml
# Main branch - comprehensive
aiEnableSkills: ${{ eq(variables['Build.SourceBranch'], 'refs/heads/main') }}
aiSkills: ${{ if eq(variables['Build.SourceBranch'], 'refs/heads/main'), 'security,performance,database', 'security' }}
```

### Cost Impact

Skills provide specialized expertise but increase token usage:

| Configuration | Tokens | Cost (Sonnet) | Use Case |
|---|---|---|---|
| No skills | 50K | $0.75 | Simple PRs |
| 2 skills | 125K | $1.88 | Security-critical |
| 3 skills | 165K | $2.48 | Comprehensive |
| 5 skills | 225K | $3.38 | Mission-critical |

### Output Example

```
🎯 Skills Mode: security,performance
   Auto-detection: enabled

  Running 3 skill(s) for src/auth/login.ts: Security, API, Performance
  [src/auth/login.ts] Skills Summary:
    - Security: 3 findings (100% quality, 1250ms)
    - API: 1 findings (100% quality, 980ms)
    - Performance: 0 findings (-, 890ms)

### src/auth/login.ts

🔴 [security] Hardcoded Password Salt
  Salt should be randomly generated, not hardcoded
  ```diff
  + const salt = "fixed-salt-123";
  ```
  💡 Use crypto.randomBytes(16).toString('hex')

🟠 [api] Missing Error Response Standardization
  Error format differs from other endpoints
```

### Best Practices

**When to use skills:**
- ✅ Security-sensitive code (auth, payments)
- ✅ Database migrations
- ✅ Public API changes
- ✅ Performance-critical endpoints
- ✅ User-facing UI components

**When to skip skills:**
- ❌ Documentation-only PRs
- ❌ Draft/WIP pull requests
- ❌ Simple bug fixes

📚 **Full Documentation**: See [Specialized Review Skills Guide](./USER_GUIDE_SKILLS.md) for:
- Detailed skill descriptions with examples
- Quality assurance framework
- Advanced configuration strategies
- Troubleshooting guide
- Cost optimization techniques

---

## Inline Code Comments & Suggestions

The AI posts findings as **inline comments directly on changed code lines** with actionable fix suggestions.

### Overview

Instead of a single wall-of-text review comment, you get:
- 🎯 **Precise annotations** at the exact problematic line
- 🔧 **One-click fixes** via GitHub suggestion blocks
- 💬 **Threaded discussions** for each finding
- 🔍 **Visual navigation** in "Files changed" view

### Example

**Finding from AI:**
```json
{
  "severity": "high",
  "category": "security",
  "title": "Hardcoded credentials",
  "file": "src/database.ts",
  "diffLines": "+ const password = 'admin123'",
  "suggestion": "const password = process.env.DB_PASSWORD"
}
```

**Posted as inline comment on src/database.ts at line 42:**

```markdown
⚠️ **HIGH - SECURITY**

**Hardcoded credentials**

Sensitive credentials should never be stored in source code.

```suggestion
const password = process.env.DB_PASSWORD
```
```

**Developer clicks "Commit suggestion" → Fixed instantly!** ✨

### Configuration

**Enabled by default:**
```yaml
- task: AiPrReviewer@1
  inputs:
    enableAiReview: true
    aiEnableInlineComments: true  # Default
```

**Disable if you only want the summary comment:**
```yaml
aiEnableInlineComments: false
```

### Platform Support

| Provider | Inline Comments | Code Suggestions | Notes |
|---|---|---|---|
| **GitHub** | ✅ | ✅ | Native ```suggestion blocks (one-click apply) |
| **GitLab** | ✅ | ✅ | Position-based discussions |
| **Bitbucket Cloud** | ✅ | ✅ | Inline anchors |
| **Bitbucket Server** | ✅ | ✅ | Anchor-based comments |

### How It Works

1. **AI analyzes diff** and generates structured findings with:
   - `file`: File path
   - `diffLines`: Actual code line (e.g., `+ const x = 5`)
   - `suggestion`: Recommended fix

2. **Diff parser maps to line numbers**:
   - Parses unified diff format (`@@ -10,5 +10,6 @@`)
   - Tracks additions (+), deletions (-), context ( )
   - Extracts exact line number in new file version

3. **Provider posts inline comments**:
   - GitHub: `pulls.createReview()` with comments array + `suggestion` blocks
   - GitLab: Discussions API with position object
   - Bitbucket: Inline comment API with line anchors

### With Skills Mode

When using specialized review skills, inline comments include skill metadata:

```yaml
aiEnableSkills: true
aiSkills: security,performance
aiEnableInlineComments: true
```

**Output:**
```markdown
🚨 **CRITICAL - SECURITY**

**[Security Skill] SQL Injection Vulnerability**

User input concatenated into SQL query without sanitization.

```suggestion
const result = await db.query(
  "SELECT * FROM users WHERE id = ?",
  [req.params.id]
);
```

**Confidence:** 95%
```

### Graceful Handling

**Missing line numbers:**
- If exact line can't be determined from diff, finding still appears in main review
- Warning logged: `⚠️ Could not find line number for finding in auth.ts`
- No incorrect inline comments posted

**Unsupported providers:**
- Falls back to main review comment
- No errors thrown

**Large PRs:**
- All findings with valid line numbers get inline comments
- Main review comment includes summary + full findings list

### Best Practices

✅ **Enable for:**
- Security-critical reviews (precise vulnerability locations)
- Performance optimization (exact inefficient patterns)
- Code quality enforcement (specific style/best-practice violations)
- Skills mode (expert findings from multiple domains)

❌ **Consider disabling for:**
- Draft PRs with 100+ findings (overwhelming)
- Dependency update PRs (low signal)
- Auto-generated code reviews

### Pipeline Output

```bash
Converting 18 findings to inline comments...
Posting 15 inline code comments...
✅ Posted 15 inline comments with code suggestions

# 3 findings skipped (line numbers not found)
# All findings still visible in main review comment
```

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
