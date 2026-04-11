# Specialized Review Skills - Complete Guide

This document provides comprehensive information about the AI review skills system.

## Quick Start

```yaml
- task: AiPrReviewer@1
  inputs:
    enableAiReview: true
    aiReviewMode: per-file
    aiEnableSkills: true
    aiSkills: security,performance
    aiSkillAutoDetect: true
```

---

## What Are Review Skills?

**Review skills** are specialized AI agents that focus on specific domains. Instead of one general-purpose reviewer, you get multiple expert reviewers working in parallel:

- 🔒 **Security Expert** - Finds vulnerabilities, auth issues, data exposure
- ⚡ **Performance Expert** - Detects N+1 queries, inefficient algorithms
- 🗄️ **Database Expert** - Reviews migrations, indexes, data integrity
- 🔌 **API Expert** - Catches breaking changes, validates REST design
- ♿ **Accessibility Expert** - Checks WCAG compliance, ARIA, keyboard nav

Each skill has:
- Specialized training prompt
- Domain-specific quality rules
- Quality score (78-92%)
- Test suites for validation
- Anti-hallucination safeguards

---

## Available Skills

### 🔒 Security (Quality: 92%)

**Analyzes:** SQL injection, XSS, CSRF, hardcoded credentials, auth bypass, weak crypto

**File patterns:** `**/auth/**`, `**/security/**`, `**/*password*`, `**/*secret*`

**Content triggers:** `password`, `token`, `SELECT`, `INSERT`, `eval(`, `dangerouslySetInnerHTML`

**Example findings:**
```
🔴 Critical: Hardcoded API key 'sk_live_xxx' exposed
  Line +45: const apiKey = 'sk_live_1234567890abcdef';
  💡 Use environment variable: process.env.API_KEY

🔴 Critical: SQL injection via string concatenation
  Lines +12-15: const query = "SELECT * FROM users WHERE id = " + userId;
  💡 Use parameterized query: db.prepare("... WHERE id = ?")
```

**When to use:**
- ✅ Authentication/authorization changes
- ✅ Payment or financial code
- ✅ User data handling
- ✅ API endpoint changes
- ✅ Crypto/encryption code

---

### ⚡ Performance (Quality: 88%)

**Analyzes:** N+1 queries, O(n²) algorithms, blocking operations, unnecessary loops

**File patterns:** `**/*.sql`, `**/queries/**`, `**/repositories/**`

**Content triggers:** `for (`, `.map(`, `.filter(`, `SELECT`, `await`

**Example findings:**
```
🟠 High: N+1 query pattern detected
  Lines +45-50: for (const user of users) { await db.getProfile(user.id); }
  💡 Use single JOIN or batch query: db.getProfiles(userIds)

🟡 Medium: Double iteration - inefficient
  Line +23: users.filter(u => u.active).map(u => u.name)
  💡 Combine into single pass: users.reduce(...)
```

**When to use:**
- ✅ Database query changes
- ✅ Loop or iteration code
- ✅ Large data processing
- ✅ API response generation
- ✅ Real-time features

---

### 🗄️ Database (Quality: 90%)

**Analyzes:** Migration safety, missing indexes, integrity issues, rollback risks

**File patterns:** `**/*migration*`, `**/*.sql`, `**/schema/**`, `**/db/**`

**Content triggers:** `CREATE TABLE`, `ALTER TABLE`, `DROP`, `INDEX`, `FOREIGN KEY`

**Example findings:**
```
🔴 Critical: DROP COLUMN without backward compatibility
  Line +12: ALTER TABLE users DROP COLUMN legacy_id;
  💡 Two-phase migration: deprecate first, drop in v+2

🟠 High: Missing index on queried column
  Line +45: WHERE user_id = ... (users table has 1M+ rows)
  💡 CREATE INDEX idx_users_user_id ON table(user_id)
```

**When to use:**
- ✅ Database migrations
- ✅ Schema changes
- ✅ Query modifications
- ✅ Index additions/removals
- ✅ Data model refactoring

---

### 🔌 API Design (Quality: 82%)

**Analyzes:** Breaking changes, inconsistent design, missing validation, poor error handling

**File patterns:** `**/api/**`, `**/routes/**`, `**/controllers/**`, `**/*route*`

**Content triggers:** `GET`, `POST`, `PUT`, `DELETE`, `router.`, `@Get`, `endpoint`

**Example findings:**
```
🔴 Critical: BREAKING - Removed 'email' from response
  Line +45: return { id, name }; // Previously: { id, name, email }
  💡 Add API versioning or deprecation period

🟡 Medium: POST returns 200 instead of 201
  Line +23: res.status(200).json(user);
  💡 Use 201 for resource creation per REST spec
```

**When to use:**
- ✅ API endpoint changes
- ✅ Response structure modifications
- ✅ New routes or controllers
- ✅ GraphQL schema changes
- ✅ Versioning updates

---

### ♿ Accessibility (Quality: 78%)

**Analyzes:** WCAG violations, missing ARIA, poor keyboard nav, screen reader issues

**File patterns:** `**/*.tsx`, `**/*.jsx`, `**/*.html`, `**/components/**`

**Content triggers:** `<img`, `<button`, `<a`, `<input`, `aria-`, `onClick`

**Example findings:**
```
🟠 High: Missing alt text - violates WCAG 1.1.1
  Line +12: <img src={avatar} />
  💡 Add: <img src={avatar} alt="User profile picture" />

🟡 Medium: Button lacks keyboard handler
  Line +45: <div onClick={handleClick}>Submit</div>
  💡 Use <button> or add onKeyDown handler
```

**When to use:**
- ✅ UI component changes
- ✅ Form modifications
- ✅ Interactive elements
- ✅ Modal/dialog implementations
- ✅ Navigation changes

---

## Configuration

### Basic Setup

```yaml
- task: AiPrReviewer@1
  inputs:
    enableAiReview: true
    aiReviewMode: per-file      # Required for skills
    aiEnableSkills: true
    aiSkills: security,performance,database
```

### Auto-Detection

Let the system add relevant skills based on file patterns:

```yaml
aiEnableSkills: true
aiSkills: security              # Always include security
aiSkillAutoDetect: true         # Add others as needed
```

**How auto-detection works:**
```
File: src/auth/login.ts
  Pattern match: **/auth/** → Security skill
  Content match: "SELECT" → Database skill
  Final skills: Security, Database

File: migrations/001_add_users.sql
  Pattern match: **/*migration* → Database skill
  Content match: "CREATE TABLE" → Database skill
  Final skills: Database
```

### Skill Combinations

**Recommended combinations:**

```yaml
# Security-focused (auth, payments, user data)
aiSkills: security,database

# Performance-critical (high-traffic endpoints)
aiSkills: performance,database

# Public APIs
aiSkills: security,api

# Frontend/UI work
aiSkills: accessibility,security

# Full stack comprehensive
aiSkills: security,performance,database,api
```

---

## Performance & Cost

### Execution Speed

Skills run in **parallel** with intelligent batching:

```
Sequential (old): 10 files × 3 skills × 5s = 150s ❌
Parallel (new):   10 files ÷ 3 batch × 5s = 17s ✅

Speed improvement: 85% faster
```

**How it works:**
1. Process 3 files simultaneously (configurable)
2. For each file, run all applicable skills in parallel
3. Quality filter removes low-confidence findings
4. Merge and synthesize results

### Token Usage & Cost

Skills increase token usage but provide specialized expertise:

| Configuration | Tokens (est.) | Cost (Sonnet) | Speed | When to Use |
|---|---|---|---|---|
| No skills | 50K | $0.75 | Fast | Simple PRs |
| 2 skills | 125K | $1.88 | Medium | Security-critical |
| 3 skills | 165K | $2.48 | Medium | Comprehensive |
| 5 skills | 225K | $3.38 | Slower | Mission-critical |

**Cost breakdown (per file):**
- Base review: ~5K tokens
- Each skill adds: ~3-5K tokens
- Quality filtering: removes 5-15% of waste

**Example PR (10 files, 3 skills):**
```
Input tokens:  90,000  ($0.27)
Output tokens: 75,000  ($1.13)
Total cost:    $1.40

Without skills: $0.50
With skills:    $1.40 (280% increase)
Value:          Specialized expertise worth it for critical PRs
```

### Cost Optimization

**Strategy 1: Selective skills**
```yaml
# Security PRs only
aiSkills: security
# vs all skills - saves 70% tokens
```

**Strategy 2: Auto-detect only**
```yaml
aiSkills: ""                    # No base skills
aiSkillAutoDetect: true         # Add as needed
# Only relevant skills run
```

**Strategy 3: Per-branch rules**
```yaml
# Main branch - comprehensive
- ${{ if eq(variables['Build.SourceBranch'], 'refs/heads/main') }}:
  - aiSkills: security,performance,database

# Feature branches - focused
- ${{ else }}:
  - aiSkills: security
```

---

## Output Examples

### Single Skill Output

```
📋 File Selection Summary:
  Selected: src/api/users.ts (priority: 75)

🎯 Skills Mode: security
   Auto-detection: enabled

  Running 1 skill(s) for src/api/users.ts: Security

  [src/api/users.ts] Skills Summary:
    - Security: 2 findings (100% quality, 1450ms)

### src/api/users.ts

🔴 [security] SQL Injection Vulnerability
  String concatenation in SQL query allows injection
  ```diff
  + const query = "SELECT * FROM users WHERE id = " + userId;
  ```
  💡 Use parameterized query: db.prepare("... WHERE id = ?")

🟠 [security] Missing Authentication Check
  Endpoint accessible without auth verification
  ```diff
  + app.get('/users/:id', async (req, res) => {
  ```
  💡 Add middleware: app.get('/users/:id', auth.required, ...)
```

### Multiple Skills Output

```
📦 Batch 1/4: Processing 3 file(s)...

  Running 3 skill(s) for src/auth/login.ts: Security, API, Performance
  [src/auth/login.ts] Skills Summary:
    - Security: 3 findings (100% quality, 1250ms)
    - API: 1 findings (100% quality, 980ms)
    - Performance: 0 findings (-, 890ms)

  Running 2 skill(s) for migrations/add_index.sql: Database, Performance
  [migrations/add_index.sql] Skills Summary:
    - Database: 2 findings (100% quality, 1100ms)
    - Performance: 1 findings (100% quality, 950ms)

  ✓ reviewed: src/auth/login.ts
  ✓ reviewed: migrations/add_index.sql
  ✓ reviewed: src/utils/format.ts

### src/auth/login.ts

🔴 [security] Hardcoded Password Salt
  Salt should be randomly generated, not hardcoded
  
🟠 [api] Missing Error Response Standardization
  Error format differs from other endpoints
  
🟡 [security] Session Timeout Not Configured
  Default timeout may be too long

### migrations/add_index.sql

🔴 [database] Missing Rollback Migration
  No DOWN migration provided
  
🟠 [performance] Index on Large Table Without CONCURRENTLY
  Will lock table during creation
```

---

## Quality Assurance

### Built-in Quality Controls

Each skill has multiple quality layers:

1. **Specialized Prompts** - Domain-specific instructions
2. **Anti-Hallucination Rules** - Must cite actual code
3. **Mandatory Citations** - Every finding needs diff line reference
4. **Confidence Thresholds** - Minimum 70-80% confidence
5. **Runtime Validation** - Filters invalid findings
6. **Max Findings Limit** - Prevents spam (8-10 per file)

### Quality Metrics

```
Skill Quality Report (per execution):

Security:
  Total findings: 5
  Accepted: 5
  Filtered: 0
  Quality rate: 100%
  Reasons filtered: none

Performance:
  Total findings: 4
  Accepted: 3
  Filtered: 1
  Quality rate: 75%
  Reasons filtered:
    - 1 finding: missing citation
```

### Filtering Rules

Findings are automatically filtered if:
- ❌ Missing diff line citation (when required)
- ❌ Citation doesn't match actual diff
- ❌ Confidence below threshold (typically 70-80%)
- ❌ Title too short or invalid
- ❌ Exceeds max findings limit

---

## Troubleshooting

### "No skills matched" Warning

```
[src/utils/helpers.ts] No skills matched, using general review
```

**Cause:** File doesn't match any skill patterns and auto-detect is off or found no content matches.

**Solutions:**
1. Enable auto-detect: `aiSkillAutoDetect: true`
2. Add explicit skills: `aiSkills: security,performance`
3. Check file is not being skipped by filters

### High Token Costs

**Problem:** Skills using too many tokens

**Solutions:**
```yaml
# Option 1: Fewer skills
aiSkills: security  # Just the essentials

# Option 2: Disable auto-detect
aiSkillAutoDetect: false  # Only use explicit skills

# Option 3: Limit files
aiMaxFiles: 5  # Review fewer files

# Option 4: Disable for low-priority PRs
- ${{ if eq(variables['Build.Reason'], 'PullRequest') }}:
  - aiEnableSkills: false  # Draft PRs
```

### Low Quality Scores

```
⚠️  Skill "performance" quality rate: 65%
```

**Cause:** Skill finding issues that get filtered

**Check:**
- Are files in diff actually relevant to the skill?
- Is the diff too small/vague for skill to analyze?
- Try different skill combinations

---

## Best Practices

### When to Use Skills

✅ **USE skills for:**
- Security-sensitive code (auth, payments, PII)
- Database migrations and schema changes
- Public API modifications
- Performance-critical endpoints
- User-facing UI components
- Production deployments

❌ **SKIP skills for:**
- Documentation-only PRs
- Simple bug fixes
- Draft/WIP pull requests
- High-volume automated PRs
- Internal tooling changes

### Skill Selection Strategy

```yaml
# Strategy 1: Security-first (recommended)
aiSkills: security
aiSkillAutoDetect: true
# Always run security, add others as needed

# Strategy 2: Comprehensive (high-value PRs)
aiSkills: security,performance,database,api
aiSkillAutoDetect: false
# Fixed set for consistency

# Strategy 3: Dynamic (cost-optimized)
aiSkills: ""
aiSkillAutoDetect: true
# Only run what's needed
```

### Pipeline Integration

```yaml
# Smart conditional execution
- task: AiPrReviewer@1
  inputs:
    enableAiReview: true
    aiReviewMode: per-file
    
    # Skills based on branch/PR
    aiEnableSkills: ${{ eq(variables['Build.SourceBranch'], 'refs/heads/main') }}
    aiSkills: ${{ if eq(variables['Build.SourceBranch'], 'refs/heads/main'), 'security,performance,database', 'security' }}
    aiSkillAutoDetect: true
    
    # Context matters
    aiReviewContext: |
      Branch: $(Build.SourceBranch)
      PR: #$(System.PullRequest.PullRequestNumber)
      Focus on production-ready code quality.
```

---

## Advanced: Custom Skills (Future)

> Note: Custom skills are not yet supported but planned for a future release.

**Future capability:**

```json
// .aiprreviewer/skills/hipaa-compliance.json
{
  "name": "HIPAA Compliance",
  "version": "1.0",
  "focus": "Protected Health Information (PHI) handling",
  "categories": ["security", "compliance", "hipaa"],
  "systemPrompt": "You are a HIPAA compliance expert...",
  "filePatterns": ["**/patient/**", "**/medical/**"],
  "requiredCitations": true,
  "testCases": [...]
}
```

```yaml
# Use custom skill
aiSkills: security,.aiprreviewer/skills/hipaa-compliance.json
```

---

## FAQ

**Q: Can I run skills without per-file mode?**
A: No, skills require `aiReviewMode: per-file` for proper execution.

**Q: How many skills should I use?**
A: Start with 1-2 (security + relevant domain), add more for critical PRs.

**Q: Do skills work with all AI providers?**
A: Yes, skills work with Anthropic, Azure, Bedrock, Vertex, and LiteLLM.

**Q: Can skills use tools (file reading)?**
A: Not yet. Skills currently analyze only the visible diff. Tool support coming soon.

**Q: How accurate are quality scores?**
A: Based on test suite performance: 90%+ = stable, 75-90% = beta, <75% = experimental.

**Q: Can I disable specific skills temporarily?**
A: Yes, just remove from the `aiSkills` list or set `aiEnableSkills: false`.

---

## See Also

- [Main User Guide](./USER_GUIDE.md)
- [FAQ](./FAQ.md)
- [Anti-Hallucination Safeguards](./USER_GUIDE.md#anti-hallucination-safeguards)
- [Cost Estimation](./USER_GUIDE.md#cost-estimation)
