import Anthropic from '@anthropic-ai/sdk';
import { callWithRetry } from './utils';

// ── Skill Schema ───────────────────────────────────────────────────────────────

export interface ReviewSkill {
  // Identity
  id: string;
  name: string;
  version: string;
  author?: string;
  
  // Certification
  certificationLevel: 'experimental' | 'beta' | 'stable';
  qualityScore?: number;  // 0-100
  
  // Behavior
  systemPrompt: string;
  focus: string;
  categories: string[];
  filePatterns?: string[];  // Auto-select skill for matching files
  contentPatterns?: string[];  // Auto-select based on diff content
  
  // Quality controls
  antiHallucinationRules: string[];
  requiredCitations: boolean;
  confidenceThreshold?: number;
  maxFindingsPerFile?: number;
  
  // Resources
  tools?: string[];
  maxTokens?: number;
  estimatedTokensPerFile?: number;
  
  // Testing (for quality assurance)
  testCases?: SkillTestCase[];
}

export interface SkillTestCase {
  name: string;
  description: string;
  diff: string;
  expectedFindings: Partial<SkillFinding>[];
  shouldNotFind?: string[];  // Terms that shouldn't appear in findings
  maxExecutionTime?: number;
}

export interface SkillFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  file: string;
  diffLines?: string;
  suggestion?: string;
  confidence?: number;  // 0-1
}

export interface SkillReviewResult {
  skillId: string;
  skillName: string;
  findings: SkillFinding[];
  reasoning?: string[];
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  executionTime: number;
  qualityMetrics: {
    totalFindings: number;
    acceptedFindings: number;
    filteredFindings: number;
    qualityRate: number;
  };
}

// ── Built-in Skills ────────────────────────────────────────────────────────────

export const BUILTIN_SKILLS: Record<string, ReviewSkill> = {
  security: {
    id: 'security',
    name: 'Security Review',
    version: '1.0.0',
    author: 'ad-ai-pr-reviewer',
    certificationLevel: 'stable',
    qualityScore: 92,
    
    systemPrompt: `You are an expert security engineer reviewing code for vulnerabilities.

YOUR MISSION: Identify security issues visible in the diff that could lead to:
- Remote code execution (RCE)
- SQL injection, XSS, CSRF
- Authentication/authorization bypass
- Sensitive data exposure
- Cryptographic weaknesses

CRITICAL QUALITY RULES:
1. ONLY analyze lines with + or - in the diff
2. CITE exact diff lines for EVERY finding (mandatory)
3. Be conservative - avoid false positives
4. Use accurate severity:
   - critical: RCE, SQL injection, auth bypass, hardcoded secrets
   - high: XSS, CSRF, sensitive data exposure in logs
   - medium: Missing validation, weak crypto, insecure defaults
   - low: Security improvements, missing security headers
   - info: Needs verification outside diff
5. If uncertain, use "info" severity with "Verify:" prefix

GROUNDING CHECKLIST (verify before reporting):
- [ ] Issue is in a line starting with + or -
- [ ] I can quote the exact problematic code
- [ ] Not making assumptions about external code
- [ ] Severity matches the actual risk

GOOD FINDINGS (cite specific code):
✅ "Line +45: Hardcoded API key 'sk_live_xxx' should use environment variable"
✅ "Lines +12-15: SQL query concatenates user input, vulnerable to injection"
✅ "Line +78: Password logged in plaintext"

BAD FINDINGS (avoid these):
❌ "This endpoint might be vulnerable" (speculation)
❌ "Database lacks encryption" (not in diff)
❌ "Consider using HTTPS" (generic advice)

OUTPUT: Return structured JSON with findings array.`,

    focus: 'Security vulnerabilities, authentication, data protection',
    categories: ['security', 'authentication', 'authorization', 'injection', 'xss', 'csrf', 'crypto'],
    
    filePatterns: [
      '**/auth/**',
      '**/security/**',
      '**/crypto/**',
      '**/*auth*',
      '**/*password*',
      '**/*secret*',
      '**/*token*',
    ],
    
    contentPatterns: [
      'password',
      'token',
      'secret',
      'private key',
      'api key',
      'SQL',
      'SELECT',
      'INSERT',
      'eval(',
      'exec(',
      'dangerouslySetInnerHTML',
    ],
    
    antiHallucinationRules: [
      'Must cite exact diff lines for every finding',
      'Cannot reference code outside visible diff',
      'Cannot make assumptions about external systems',
      'Must use cautious language for uncertainties',
      'Severity must match actual visible risk',
    ],
    
    requiredCitations: true,
    confidenceThreshold: 0.75,
    maxFindingsPerFile: 10,
    tools: ['read_full_file', 'search_codebase'],
    maxTokens: 2048,
    estimatedTokensPerFile: 900,
    
    testCases: [
      {
        name: 'SQL Injection Detection',
        description: 'Should detect SQL injection from string concatenation',
        diff: `
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -10,3 +10,5 @@ export async function getUser(userId: string) {
+  const query = "SELECT * FROM users WHERE id = " + userId;
+  const result = await db.execute(query);
+  return result.rows[0];
`,
        expectedFindings: [
          {
            severity: 'critical',
            category: 'security',
            title: 'SQL Injection',
            diffLines: 'SELECT * FROM',
          }
        ],
        shouldNotFind: ['XSS', 'CSRF'],
      },
      {
        name: 'Hardcoded Credentials',
        description: 'Should detect hardcoded API keys',
        diff: `
--- a/src/config/api.ts
+++ b/src/config/api.ts
@@ -5,2 +5,3 @@ export const config = {
+  apiKey: 'sk_live_1234567890abcdef',
+  apiSecret: 'secret_abc123',
`,
        expectedFindings: [
          {
            severity: 'critical',
            category: 'security',
            title: 'Hardcoded Credentials',
          }
        ],
      },
      {
        name: 'Safe Parameterized Query',
        description: 'Should NOT flag safe parameterized queries',
        diff: `
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -10,3 +10,5 @@ export async function getUser(userId: string) {
+  const query = db.prepare("SELECT * FROM users WHERE id = ?");
+  const result = await query.execute([userId]);
+  return result.rows[0];
`,
        expectedFindings: [],
        shouldNotFind: ['injection', 'vulnerable', 'SQL'],
      },
    ],
  },

  performance: {
    id: 'performance',
    name: 'Performance Review',
    version: '1.0.0',
    author: 'ad-ai-pr-reviewer',
    certificationLevel: 'stable',
    qualityScore: 88,
    
    systemPrompt: `You are a performance optimization expert reviewing code for efficiency issues.

YOUR MISSION: Identify performance problems in the diff:
- N+1 queries
- Inefficient algorithms (O(n²) when O(n) exists)
- Unnecessary loops or iterations
- Missing database indexes
- Large data loading without pagination
- Blocking operations in async contexts
- Memory leaks

QUALITY RULES:
1. ONLY analyze changed lines (+ or -)
2. CITE exact diff lines for findings
3. Focus on measurable performance impact
4. Severity based on scale:
   - critical: Will cause timeouts or crashes at scale
   - high: Significant performance degradation (>100ms)
   - medium: Noticeable slowdown (10-100ms)
   - low: Minor optimization opportunities
5. Provide specific optimization suggestions

GOOD FINDINGS:
✅ "Lines +45-50: N+1 query - fetches user in loop. Use single JOIN or batch query"
✅ "Line +23: Array.filter().map() creates two iterations. Chain with single map()"

BAD FINDINGS:
❌ "This might be slow" (vague)
❌ "Database needs indexes" (not in diff)

OUTPUT: Structured JSON with findings.`,

    focus: 'Performance bottlenecks, algorithmic efficiency, database queries',
    categories: ['performance', 'scalability', 'optimization', 'n+1', 'algorithm'],
    
    filePatterns: [
      '**/*.sql',
      '**/queries/**',
      '**/repositories/**',
      '**/services/**',
    ],
    
    contentPatterns: [
      'for (',
      'while (',
      '.map(',
      '.filter(',
      '.forEach(',
      'SELECT',
      'await',
      'Promise.all',
    ],
    
    antiHallucinationRules: [
      'Must show actual code causing performance issue',
      'Must estimate or explain performance impact',
      'Suggestions must be specific and actionable',
    ],
    
    requiredCitations: true,
    confidenceThreshold: 0.7,
    maxFindingsPerFile: 8,
    tools: ['read_full_file', 'search_codebase'],
    maxTokens: 2048,
    estimatedTokensPerFile: 750,
  },

  database: {
    id: 'database',
    name: 'Database Review',
    version: '1.0.0',
    author: 'ad-ai-pr-reviewer',
    certificationLevel: 'stable',
    qualityScore: 90,
    
    systemPrompt: `You are a database expert reviewing schema changes, queries, and migrations.

YOUR MISSION: Identify database-related issues:
- Missing indexes on queried columns
- N+1 query patterns
- Missing foreign key constraints
- Non-atomic migrations
- Data loss risks in migrations
- Missing rollback procedures
- Lock contention risks
- SQL injection vulnerabilities

QUALITY RULES:
1. CITE exact SQL/migration code from diff
2. Focus on correctness and safety
3. Severity:
   - critical: Data loss risk, production breakage
   - high: Missing indexes on large tables, integrity issues
   - medium: Suboptimal queries, missing constraints
   - low: Style, naming conventions
4. For migrations, always consider rollback

GOOD FINDINGS:
✅ "Line +12: DROP COLUMN without default - will break old app versions"
✅ "Line +45: WHERE clause on user_id without index - query will be slow"

OUTPUT: Structured JSON.`,

    focus: 'Database schema, migrations, query optimization, data integrity',
    categories: ['database', 'migration', 'sql', 'performance', 'data-integrity'],
    
    filePatterns: [
      '**/*migration*',
      '**/*schema*',
      '**/*.sql',
      '**/migrations/**',
      '**/db/**',
      '**/database/**',
    ],
    
    contentPatterns: [
      'CREATE TABLE',
      'ALTER TABLE',
      'DROP',
      'ADD COLUMN',
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'INDEX',
      'FOREIGN KEY',
    ],
    
    antiHallucinationRules: [
      'Must reference actual SQL/schema in diff',
      'Migration issues must show specific risk',
      'Index suggestions must reference queried columns in diff',
    ],
    
    requiredCitations: true,
    confidenceThreshold: 0.8,
    maxFindingsPerFile: 8,
    tools: ['read_full_file', 'search_codebase'],
    maxTokens: 2048,
    estimatedTokensPerFile: 800,
  },

  api: {
    id: 'api',
    name: 'API Design Review',
    version: '1.0.0',
    author: 'ad-ai-pr-reviewer',
    certificationLevel: 'beta',
    qualityScore: 82,
    
    systemPrompt: `You are an API design expert reviewing endpoint changes.

YOUR MISSION: Identify API issues:
- Breaking changes to existing endpoints
- Missing error handling
- Inconsistent response formats
- Missing input validation
- Poor HTTP status code usage
- Missing rate limiting
- Pagination issues
- Versioning problems

QUALITY RULES:
1. CITE endpoint code from diff
2. Severity:
   - critical: Breaking change to public API
   - high: Security issue, data exposure
   - medium: Inconsistent design, missing validation
   - low: Style, documentation
3. Distinguish between new endpoints vs. changes to existing

GOOD FINDINGS:
✅ "Line +45: Removed 'email' field from response - BREAKING change"
✅ "Line +23: POST endpoint returns 200 instead of 201 for resource creation"

OUTPUT: Structured JSON.`,

    focus: 'API design, breaking changes, REST best practices, error handling',
    categories: ['api', 'breaking-change', 'rest', 'graphql', 'versioning'],
    
    filePatterns: [
      '**/api/**',
      '**/routes/**',
      '**/controllers/**',
      '**/endpoints/**',
      '**/*controller*',
      '**/*route*',
    ],
    
    contentPatterns: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'router.',
      'app.get',
      'app.post',
      '@Get',
      '@Post',
      'endpoint',
    ],
    
    antiHallucinationRules: [
      'Must show actual endpoint code',
      'Breaking changes must compare old vs new behavior',
      'Status code recommendations must reference HTTP spec',
    ],
    
    requiredCitations: true,
    confidenceThreshold: 0.75,
    maxFindingsPerFile: 8,
    tools: ['read_full_file', 'search_codebase'],
    maxTokens: 2048,
    estimatedTokensPerFile: 700,
  },

  accessibility: {
    id: 'accessibility',
    name: 'Accessibility Review',
    version: '1.0.0',
    author: 'ad-ai-pr-reviewer',
    certificationLevel: 'beta',
    qualityScore: 78,
    
    systemPrompt: `You are an accessibility (a11y) expert reviewing UI code.

YOUR MISSION: Identify accessibility issues:
- Missing alt text on images
- Missing ARIA labels
- Poor keyboard navigation
- Insufficient color contrast
- Missing focus indicators
- Semantic HTML violations
- Screen reader incompatibility

QUALITY RULES:
1. CITE actual HTML/JSX from diff
2. Reference WCAG 2.1 guidelines when applicable
3. Severity:
   - critical: Complete blocker for assistive tech users
   - high: Major usability issue
   - medium: WCAG violation
   - low: Enhancement
4. Provide specific WCAG-compliant fixes

GOOD FINDINGS:
✅ "Line +12: <img> missing alt attribute - violates WCAG 1.1.1"
✅ "Line +45: <button> has onClick but no keyboard handler"

OUTPUT: Structured JSON.`,

    focus: 'WCAG compliance, screen readers, keyboard navigation, ARIA',
    categories: ['accessibility', 'a11y', 'wcag', 'aria', 'screen-reader'],
    
    filePatterns: [
      '**/*.tsx',
      '**/*.jsx',
      '**/*.html',
      '**/*.vue',
      '**/components/**',
    ],
    
    contentPatterns: [
      '<img',
      '<button',
      '<a',
      '<input',
      'aria-',
      'role=',
      'onClick',
      'tabIndex',
    ],
    
    antiHallucinationRules: [
      'Must reference actual HTML/JSX elements in diff',
      'WCAG violations must cite specific guideline',
      'Fixes must be WCAG-compliant',
    ],
    
    requiredCitations: true,
    confidenceThreshold: 0.7,
    maxFindingsPerFile: 10,
    tools: [],
    maxTokens: 1536,
    estimatedTokensPerFile: 600,
  },
};

// ── Skill Selection ────────────────────────────────────────────────────────────

/**
 * Select which skills should review a given file
 */
export function selectSkillsForFile(
  file: string,
  diff: string,
  requestedSkills: string[],
  autoDetect: boolean = true,
): ReviewSkill[] {
  const skills: ReviewSkill[] = [];
  const skillIds = new Set<string>();

  // Add explicitly requested skills
  for (const skillId of requestedSkills) {
    const skill = BUILTIN_SKILLS[skillId];
    if (skill && !skillIds.has(skill.id)) {
      skills.push(skill);
      skillIds.add(skill.id);
    }
  }

  // Auto-detect additional skills if enabled
  if (autoDetect) {
    for (const skill of Object.values(BUILTIN_SKILLS)) {
      if (skillIds.has(skill.id)) continue; // Already added

      // Check file patterns
      if (skill.filePatterns) {
        const matches = skill.filePatterns.some(pattern =>
          matchesPattern(file, pattern)
        );
        if (matches) {
          skills.push(skill);
          skillIds.add(skill.id);
          continue;
        }
      }

      // Check content patterns
      if (skill.contentPatterns) {
        const matches = skill.contentPatterns.some(pattern =>
          diff.toLowerCase().includes(pattern.toLowerCase())
        );
        if (matches) {
          skills.push(skill);
          skillIds.add(skill.id);
        }
      }
    }
  }

  // Always include 'general' if no skills selected
  if (skills.length === 0) {
    // General skill is handled by default reviewSingleFile
    return [];
  }

  return skills;
}

/**
 * Simple glob pattern matching
 */
function matchesPattern(path: string, pattern: string): boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

// ── Utility Functions ──────────────────────────────────────────────────────────

/**
 * Get skill by ID
 */
export function getSkillById(skillId: string): ReviewSkill | undefined {
  return BUILTIN_SKILLS[skillId];
}

/**
 * List all available skills
 */
export function listAvailableSkills(): ReviewSkill[] {
  return Object.values(BUILTIN_SKILLS);
}

/**
 * Get skill IDs from comma-separated string
 */
export function parseSkillIds(skillsInput: string): string[] {
  return skillsInput
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// ── Skill Execution ────────────────────────────────────────────────────────────

/**
 * Execute a skill review on a single file
 */
export async function executeSkill(
  skill: ReviewSkill,
  file: string,
  diff: string,
  client: any,  // AnthropicLike
  options: {
    model?: string;
    enableReasoning?: boolean;
    enableTools?: boolean;
    repositoryPath?: string;
    prTitle?: string;
    additionalContext?: string;
  }
): Promise<SkillReviewResult> {
  const startTime = Date.now();
  
  // Build skill-specific prompt
  const systemPrompt = skill.systemPrompt;
  
  const userPrompt = buildSkillUserPrompt(skill, file, diff, options);
  
  const maxTokens = skill.maxTokens || (options.enableReasoning ? 4096 : 2048);
  
  const messageParams: any = {
    model: options.model || 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  };
  
  // Enable reasoning if requested
  if (options.enableReasoning) {
    messageParams.thinking = {
      type: 'enabled',
      budget_tokens: 2048,
    };
  }
  
  // Enable tools if skill allows and option is set
  if (options.enableTools && skill.tools && skill.tools.length > 0 && options.repositoryPath) {
    // Import tools from reviewer.ts
    // For now, we'll skip tool calling in skills to keep it simple
    // Tools can be added in a future enhancement
  }
  
  try {
    const message = await callWithRetry<Anthropic.Message>(() => client.messages.create(messageParams));

    // Extract response
    const responseText = extractTextFromMessage(message);
    
    // Parse findings
    const parsed = parseSkillResponse(responseText, file, skill);
    
    // Validate and filter findings
    const validated = validateSkillFindings(parsed.findings, diff, skill);
    
    const executionTime = Date.now() - startTime;
    
    // Extract token usage
    const tokenUsage = message.usage ? {
      inputTokens: message.usage.input_tokens || 0,
      outputTokens: message.usage.output_tokens || 0,
      totalTokens: (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0),
    } : undefined;
    
    return {
      skillId: skill.id,
      skillName: skill.name,
      findings: validated.accepted,
      reasoning: parsed.reasoning,
      tokenUsage,
      executionTime,
      qualityMetrics: {
        totalFindings: parsed.findings.length,
        acceptedFindings: validated.accepted.length,
        filteredFindings: validated.filtered.length,
        qualityRate: parsed.findings.length > 0 
          ? validated.accepted.length / parsed.findings.length 
          : 1.0,
      },
    };
    
  } catch (error) {
    console.error(`Error executing skill ${skill.name}:`, error);
    return {
      skillId: skill.id,
      skillName: skill.name,
      findings: [],
      executionTime: Date.now() - startTime,
      qualityMetrics: {
        totalFindings: 0,
        acceptedFindings: 0,
        filteredFindings: 0,
        qualityRate: 0,
      },
    };
  }
}

/**
 * Build user prompt for skill
 */
function buildSkillUserPrompt(
  skill: ReviewSkill,
  file: string,
  diff: string,
  options: { prTitle?: string; additionalContext?: string }
): string {
  const lines: string[] = [];
  
  if (options.prTitle) {
    lines.push(`## PR: ${options.prTitle}`);
  }
  
  if (options.additionalContext) {
    lines.push(`**Context:** ${options.additionalContext}`);
  }
  
  lines.push(`\n## File: \`${file}\``);
  lines.push(`\n**Skill Focus:** ${skill.focus}`);
  lines.push(`\n\`\`\`diff`);
  lines.push(diff);
  lines.push(`\`\`\``);
  lines.push(`\nAnalyze the above diff for ${skill.focus.toLowerCase()}.`);
  lines.push(`Return JSON: {"findings": [{"severity": "...", "category": "...", "title": "...", "description": "...", "file": "${file}", "diffLines": "...", "suggestion": "..."}]}`);
  
  return lines.join('\n');
}

/**
 * Extract text from Anthropic message
 */
function extractTextFromMessage(message: any): string {
  for (const block of message.content) {
    if (block.type === 'text') {
      return block.text;
    }
  }
  console.warn('⚠️  No text content in AI response — using empty fallback');
  return '';
}

/**
 * Parse skill response
 */
function parseSkillResponse(text: string, file: string, skill: ReviewSkill): {
  findings: SkillFinding[];
  reasoning?: string[];
} {
  // Try to extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn(`Skill ${skill.name} returned non-JSON response`);
    return { findings: [] };
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    
    const findings: SkillFinding[] = (parsed.findings || []).map((f: any) => ({
      severity: f.severity || 'info',
      category: f.category || skill.categories[0],
      title: f.title || 'Untitled',
      description: f.description || '',
      file: file,
      diffLines: f.diffLines,
      suggestion: f.suggestion,
      confidence: f.confidence,
    }));
    
    return {
      findings,
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    console.warn(`Failed to parse skill ${skill.name} response:`, err);
    return { findings: [] };
  }
}

/**
 * Validate skill findings and filter low-quality ones
 */
function validateSkillFindings(
  findings: SkillFinding[],
  diff: string,
  skill: ReviewSkill
): { accepted: SkillFinding[]; filtered: SkillFinding[] } {
  const accepted: SkillFinding[] = [];
  const filtered: SkillFinding[] = [];
  
  for (const finding of findings) {
    let shouldFilter = false;
    let filterReason = '';
    
    // Check 1: Required citations
    if (skill.requiredCitations && !finding.diffLines) {
      shouldFilter = true;
      filterReason = 'missing citation';
    }
    
    // Check 2: Citation must exist in diff
    if (finding.diffLines && !diff.includes(finding.diffLines.trim())) {
      shouldFilter = true;
      filterReason = 'hallucinated diff line';
    }
    
    // Check 3: Confidence threshold
    if (skill.confidenceThreshold && finding.confidence && finding.confidence < skill.confidenceThreshold) {
      shouldFilter = true;
      filterReason = `low confidence (${finding.confidence})`;
    }
    
    // Check 4: Title/description quality
    if (!finding.title || finding.title.length < 10) {
      shouldFilter = true;
      filterReason = 'invalid title';
    }
    
    if (shouldFilter) {
      console.log(`  [${skill.name}] Filtered: ${finding.title} (${filterReason})`);
      filtered.push(finding);
    } else {
      accepted.push(finding);
    }
  }
  
  // Check 5: Max findings limit
  if (skill.maxFindingsPerFile && accepted.length > skill.maxFindingsPerFile) {
    const excess = accepted.splice(skill.maxFindingsPerFile);
    filtered.push(...excess);
    console.log(`  [${skill.name}] Filtered ${excess.length} findings (exceeded max ${skill.maxFindingsPerFile})`);
  }
  
  return { accepted, filtered };
}

// ── Batch Execution ────────────────────────────────────────────────────────────

/**
 * Execute multiple skills in parallel for a single file
 */
export async function executeSkillsParallel(
  skills: ReviewSkill[],
  file: string,
  diff: string,
  client: any,
  options: any
): Promise<SkillReviewResult[]> {
  console.log(`  Running ${skills.length} skill(s) for ${file}: ${skills.map(s => s.name).join(', ')}`);
  
  const results = await Promise.all(
    skills.map(skill => executeSkill(skill, file, diff, client, options))
  );
  
  // Log summary
  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);
  console.log(`  ✓ ${skills.length} skills completed, ${totalFindings} findings total`);
  
  return results;
}

/**
 * Merge findings from multiple skills
 */
export function mergeSkillResults(results: SkillReviewResult[]): {
  allFindings: SkillFinding[];
  bySkill: Map<string, SkillFinding[]>;
  totalTokens: number;
  totalExecutionTime: number;
} {
  const allFindings: SkillFinding[] = [];
  const bySkill = new Map<string, SkillFinding[]>();
  let totalTokens = 0;
  let totalExecutionTime = 0;
  
  for (const result of results) {
    allFindings.push(...result.findings);
    bySkill.set(result.skillId, result.findings);
    
    if (result.tokenUsage) {
      totalTokens += result.tokenUsage.totalTokens;
    }
    totalExecutionTime += result.executionTime;
  }
  
  return {
    allFindings,
    bySkill,
    totalTokens,
    totalExecutionTime,
  };
}
