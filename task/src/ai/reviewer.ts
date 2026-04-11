import Anthropic from '@anthropic-ai/sdk';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import AnthropicVertex from '@anthropic-ai/vertex-sdk';

// ── Provider configuration ─────────────────────────────────────────────────────

export type AiProviderConfig =
  | { provider: 'anthropic'; apiKey: string }
  | { provider: 'azure';     apiKey: string; baseUrl: string }
  | { provider: 'litellm';   apiKey: string; baseUrl: string }
  | { provider: 'bedrock';   accessKeyId?: string; secretAccessKey?: string; region: string }
  | { provider: 'vertex';    projectId: string; region: string };

// Minimal duck-typed interface satisfied by Anthropic, AnthropicBedrock, and AnthropicVertex
type AnthropicLike = {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
};

function buildAiClient(config: AiProviderConfig): AnthropicLike {
  switch (config.provider) {
    case 'anthropic':
      return new Anthropic({ apiKey: config.apiKey });

    case 'azure':
      // Azure AI Foundry exposes Claude via an Anthropic-compatible endpoint.
      // Auth uses the deployment API key passed as both the SDK apiKey and x-api-key header.
      return new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        defaultHeaders: { 'api-key': config.apiKey },
      });

    case 'litellm':
      // LiteLLM proxy implements the Anthropic Messages API.
      // apiKey may be a proxy-level key or empty depending on proxy config.
      return new Anthropic({
        apiKey: config.apiKey || 'no-key',
        baseURL: config.baseUrl,
      });

    case 'bedrock': {
      // AWS credentials fall back to environment variables / IAM role if not provided.
      // Use separate constructor calls so TypeScript resolves each overload independently.
      let bedrockClient: AnthropicBedrock;
      if (config.accessKeyId && config.secretAccessKey) {
        bedrockClient = new AnthropicBedrock({ awsAccessKey: config.accessKeyId, awsSecretKey: config.secretAccessKey, awsRegion: config.region });
      } else {
        bedrockClient = new AnthropicBedrock({ awsRegion: config.region });
      }
      return bedrockClient as unknown as AnthropicLike;
    }

    case 'vertex':
      // GCP authentication uses Application Default Credentials (ADC).
      // Run `gcloud auth application-default login` or set GOOGLE_APPLICATION_CREDENTIALS.
      return new AnthropicVertex({
        projectId: config.projectId,
        region:    config.region,
      }) as unknown as AnthropicLike;
  }
}

// ── Public types ───────────────────────────────────────────────────────────────

export interface ReviewOptions {
  diff: string;
  prTitle: string;
  prDescription?: string;
  additionalContext?: string;
  model?: string;
  maxDiffLines?: number;
  reviewMode?: 'standard' | 'per-file';
  maxFiles?: number;
  enableReasoning?: boolean;
}

export interface ReviewCategory {
  name: string;
  count: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalTokens: number;
  estimatedCost: number;
  model: string;
}

export interface ReviewResult {
  summary: string;
  fullComment: string;
  categories: ReviewCategory[];
  verdict: 'lgtm' | 'needs-work' | 'critical';
  totalIssues: number;
  validationWarnings?: string[];
  usage?: TokenUsage;
  reasoning?: string[];
}

interface DiffMetadata {
  files: string[];
  additions: number;
  deletions: number;
  totalLines: number;
  fileExtensions: Set<string>;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_DIFF_LINES = 500;
const DEFAULT_MAX_FILES = 10;

// Model pricing per million tokens (as of April 2026)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5': { input: 0.80, output: 4.00 },
  // Legacy models
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
};

// ── Entry point ────────────────────────────────────────────────────────────────

export async function reviewPullRequest(
  config: AiProviderConfig,
  options: ReviewOptions,
): Promise<ReviewResult> {
  const client = buildAiClient(config);

  if (options.reviewMode === 'per-file') {
    return reviewPerFile(client, options);
  }
  return reviewStandard(client, options);
}

// ── Standard mode ─────────────────────────────────────────────────────────────

async function reviewStandard(
  client: AnthropicLike,
  options: ReviewOptions,
): Promise<ReviewResult> {
  const maxLines = options.maxDiffLines ?? DEFAULT_MAX_DIFF_LINES;
  const diff = truncateDiff(options.diff, maxLines);
  const model = options.model ?? DEFAULT_MODEL;

  const messageParams: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 2048,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildStandardPrompt(options, diff) }],
  };

  // Enable extended thinking if requested
  if (options.enableReasoning) {
    messageParams.thinking = {
      type: 'enabled',
      budget_tokens: 1024,
    };
  }

  const message = await client.messages.create(messageParams);

  // Extract reasoning and usage
  const reasoning = extractReasoning(message);
  const usage = extractUsage(message, model);

  // Log reasoning and usage
  if (reasoning.length > 0) {
    logReasoning(reasoning, 'Standard Review');
  }
  logUsage(usage, 'Standard Review');

  const result = buildResult(extractText(message), options.diff);
  result.reasoning = reasoning;
  result.usage = usage;

  return result;
}

// ── Per-file mode ─────────────────────────────────────────────────────────────

async function reviewPerFile(
  client: AnthropicLike,
  options: ReviewOptions,
): Promise<ReviewResult> {
  const files = splitDiffByFile(options.diff);
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const filesToReview = files.slice(0, maxFiles);
  const skipped = files.length - filesToReview.length;

  console.log(`Per-file review: ${filesToReview.length} files${skipped > 0 ? ` (${skipped} skipped — limit ${maxFiles})` : ''}`);

  const fileFindings: Array<{ file: string; findings: string }> = [];
  const allReasoning: string[] = [];
  let totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
    model: options.model ?? DEFAULT_MODEL,
  };

  for (const { file, diff } of filesToReview) {
    const { findings, reasoning, usage } = await reviewSingleFile(client, options, file, diff);
    fileFindings.push({ file, findings });
    
    if (reasoning.length > 0) {
      allReasoning.push(`File: ${file}`, ...reasoning);
    }
    
    if (usage) {
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      totalUsage.totalTokens += usage.totalTokens;
      totalUsage.estimatedCost += usage.estimatedCost;
      if (usage.cacheReadTokens) {
        totalUsage.cacheReadTokens = (totalUsage.cacheReadTokens || 0) + usage.cacheReadTokens;
      }
      if (usage.cacheCreationTokens) {
        totalUsage.cacheCreationTokens = (totalUsage.cacheCreationTokens || 0) + usage.cacheCreationTokens;
      }
    }
    
    console.log(`  reviewed: ${file}`);
  }

  const { fullComment, reasoning: synthReasoning, usage: synthUsage } = 
    await synthesizeFindings(client, options, fileFindings, skipped);

  // Combine synthesis reasoning and usage
  if (synthReasoning.length > 0) {
    allReasoning.push('Synthesis:', ...synthReasoning);
  }
  
  if (synthUsage) {
    totalUsage.inputTokens += synthUsage.inputTokens;
    totalUsage.outputTokens += synthUsage.outputTokens;
    totalUsage.totalTokens += synthUsage.totalTokens;
    totalUsage.estimatedCost += synthUsage.estimatedCost;
    if (synthUsage.cacheReadTokens) {
      totalUsage.cacheReadTokens = (totalUsage.cacheReadTokens || 0) + synthUsage.cacheReadTokens;
    }
    if (synthUsage.cacheCreationTokens) {
      totalUsage.cacheCreationTokens = (totalUsage.cacheCreationTokens || 0) + synthUsage.cacheCreationTokens;
    }
  }

  // Log total usage for per-file review
  logUsage(totalUsage, 'Per-File Review (Total)');

  const result = buildResult(fullComment, options.diff);
  result.reasoning = allReasoning;
  result.usage = totalUsage;

  return result;
}

async function reviewSingleFile(
  client: AnthropicLike,
  options: ReviewOptions,
  file: string,
  diff: string,
): Promise<{ findings: string; reasoning: string[]; usage: TokenUsage | null }> {
  const maxLines = options.maxDiffLines ?? DEFAULT_MAX_DIFF_LINES;
  const truncated = truncateDiff(diff, Math.floor(maxLines / 3));
  const model = options.model ?? DEFAULT_MODEL;

  const system = `You are reviewing a single file's changes in a pull request.

CRITICAL - Anti-Hallucination Rules:
- Focus ONLY on the changes visible in this file's diff (lines with + or -)
- DO NOT reference code, functions, or variables not shown in the diff
- DO NOT make assumptions about the rest of the file or codebase
- If you cannot verify something from the visible diff, use phrases like "Verify that..." or "Check if..."

Be concise — list only real issues as bullet points.
Do not repeat the code, do not summarize unchanged logic.
Categories to use if relevant: Bugs, Security, Performance, Style.
If the file looks fine, say "No issues." in one line.`;

  const user = [
    `## PR: ${options.prTitle}`,
    options.additionalContext ? `**Context:** ${options.additionalContext}` : '',
    '',
    `## File: \`${file}\``,
    '```diff',
    truncated,
    '```',
    '',
    'List any issues with this file change. Be brief.',
  ].filter(l => l !== undefined).join('\n');

  // When reasoning is enabled, max_tokens must be > budget_tokens
  // Use higher limit to accommodate thinking output + response
  const maxTokens = options.enableReasoning ? 2048 : 512;

  const messageParams: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };

  // Enable extended thinking if requested
  // Note: Anthropic requires minimum 1024 tokens for thinking budget
  // and max_tokens must be greater than budget_tokens
  if (options.enableReasoning) {
    messageParams.thinking = {
      type: 'enabled',
      budget_tokens: 1024,
    };
  }

  const message = await client.messages.create(messageParams);

  const reasoning = extractReasoning(message);
  const usage = extractUsage(message, model);

  // Log reasoning for this file
  if (reasoning.length > 0) {
    logReasoning(reasoning, `File: ${file}`);
  }

  return {
    findings: extractText(message),
    reasoning,
    usage,
  };
}

async function synthesizeFindings(
  client: AnthropicLike,
  options: ReviewOptions,
  fileFindings: Array<{ file: string; findings: string }>,
  skippedFiles: number,
): Promise<{ fullComment: string; reasoning: string[]; usage: TokenUsage | null }> {
  const fileSections = fileFindings.map(({ file, findings }) =>
    `### \`${file}\`\n${findings}`,
  ).join('\n\n');

  const skippedNote = skippedFiles > 0
    ? `\n\n> Note: ${skippedFiles} file(s) were not individually reviewed (limit reached).`
    : '';

  const system = `You are synthesizing per-file code review findings into an integral PR assessment.

CRITICAL - Anti-Hallucination Rules:
- Base your synthesis ONLY on the per-file findings provided below
- DO NOT introduce new issues not mentioned in the per-file reviews
- DO NOT reference files, functions, or code not mentioned in the findings
- If suggesting cross-file issues, they must be based on findings you can see

Your job:
1. Write a brief overall summary (2-3 sentences)
2. Flag any cross-file issues (e.g. interface changed in one file but callers not updated)
3. Note any patterns across multiple files (e.g. consistent missing error handling)
4. Group all findings under: Bugs, Security, Performance, Style
5. Only list real, concrete issues as bullet points. Omit any category that has nothing to report — do not write "No issues found" bullets.

Use markdown. Be direct. Do not repeat per-file findings verbatim — synthesize them.

End your response with this exact block (choose one verdict, count only real issues):
**Review Verdict:** LGTM | Needs Work | Critical Issues
**Issues Found:** [number]`;

  const user = [
    `## PR: ${options.prTitle}`,
    options.prDescription ? `**Description:** ${options.prDescription}` : '',
    options.additionalContext ? `**Reviewer context:** ${options.additionalContext}` : '',
    '',
    '## Per-File Findings',
    fileSections,
    skippedNote,
    '',
    'Provide the integral assessment.',
  ].filter(l => l !== undefined).join('\n');

  const model = options.model ?? DEFAULT_MODEL;
  const messageParams: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: user }],
  };

  // Enable extended thinking if requested
  if (options.enableReasoning) {
    messageParams.thinking = {
      type: 'enabled',
      budget_tokens: 1024,
    };
  }

  const message = await client.messages.create(messageParams);

  const reasoning = extractReasoning(message);
  const usage = extractUsage(message, model);

  // Log reasoning for synthesis
  if (reasoning.length > 0) {
    logReasoning(reasoning, 'Synthesis');
  }

  const synthesis = extractText(message);

  const perFileSection = [
    '',
    '---',
    '<details>',
    '<summary>Per-file breakdown</summary>',
    '',
    fileSections,
    '',
    '</details>',
  ].join('\n');

  return {
    fullComment: synthesis + perFileSection,
    reasoning,
    usage,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function splitDiffByFile(diff: string): Array<{ file: string; diff: string }> {
  const sections = diff.split(/^(?=diff --git )/m);
  return sections
    .filter(s => s.trim())
    .map(section => {
      const match = section.match(/^diff --git a\/.+ b\/(.+)\n/);
      const file = match ? match[1].trim() : 'unknown';
      return { file, diff: section };
    });
}

function buildSystemPrompt(): string {
  return `You are an expert code reviewer. Your job is to review pull request diffs and provide constructive, actionable feedback.

CRITICAL - Anti-Hallucination Rules:
- ONLY comment on code that is VISIBLE in the diff provided (lines starting with + or -)
- NEVER reference files, functions, or code that are not shown in the diff
- DO NOT make assumptions about code outside the diff
- If you need context that's not in the diff, explicitly state "Cannot verify without seeing..."
- NEVER invent specific line numbers, function names, or variable names not in the diff
- Do not speculate about "existing code" or "other parts of the codebase" unless visible
- If something MIGHT be an issue but you can't confirm from the diff, say "Verify that..." instead of stating it as fact

Guidelines:
- Be concise and specific. Point to exact lines or patterns when possible.
- Prioritize: bugs and correctness > security issues > performance > style/readability.
- Acknowledge good patterns when you see them.
- Group feedback by category (e.g., Bugs, Security, Performance, Style).
- If the change is small or looks good, say so briefly — don't pad feedback.
- Use markdown formatting in your response.
- Only list real, concrete issues as bullet points. If a category has nothing to report, omit it entirely — do not write "No issues found" bullets.

End your response with this exact block (choose one verdict, count only real issues):
**Review Verdict:** LGTM | Needs Work | Critical Issues
**Issues Found:** [number]`;
}

function buildStandardPrompt(options: ReviewOptions, diff: string): string {
  const lines: string[] = [];

  lines.push(`## Pull Request: ${options.prTitle}`);

  if (options.prDescription?.trim()) {
    lines.push('');
    lines.push('**Description:**');
    lines.push(options.prDescription.trim());
  }

  if (options.additionalContext?.trim()) {
    lines.push('');
    lines.push('**Reviewer context:**');
    lines.push(options.additionalContext.trim());
  }

  lines.push('');
  lines.push('## Diff');
  lines.push('```diff');
  lines.push(diff);
  lines.push('```');

  lines.push('');
  lines.push(
    'Please review this pull request. Structure your response with a brief overall summary first, then grouped findings.',
  );

  return lines.join('\n');
}

function extractText(message: Anthropic.Message): string {
  // When reasoning is enabled, content may contain thinking blocks first
  // We need to find the text block specifically
  for (const block of message.content) {
    if (block.type === 'text') {
      return block.text;
    }
  }
  throw new Error('No text content found in AI response');
}

function buildResult(reviewText: string, diff?: string): ReviewResult {
  const summary = extractSummaryLine(reviewText);
  const categories = parseCategories(reviewText);
  const verdict = determineVerdict(categories, reviewText);

  // Prefer the explicit count the AI was asked to emit; fall back to category sum
  const issueCountMatch = reviewText.match(/\*\*Issues Found:\*\*\s*(\d+)/i);
  const totalIssues = issueCountMatch
    ? parseInt(issueCountMatch[1], 10)
    : categories.reduce((sum, c) => sum + c.count, 0);

  const result: ReviewResult = { 
    summary, 
    fullComment: reviewText, 
    categories, 
    verdict, 
    totalIssues 
  };

  // Add validation if diff is provided
  if (diff) {
    const metadata = extractDiffMetadata(diff);
    const warnings = validateReview(reviewText, metadata);
    
    if (warnings.length > 0) {
      result.validationWarnings = warnings;
      console.warn('⚠️  AI Review Validation Warnings:');
      warnings.forEach(w => console.warn(`  - ${w}`));
    }
  }

  return result;
}

function truncateDiff(diff: string, maxLines: number): string {
  const lines = diff.split('\n');
  if (lines.length <= maxLines) return diff;

  const truncated = lines.slice(0, maxLines);
  truncated.push('');
  truncated.push(`... [diff truncated at ${maxLines} lines — ${lines.length - maxLines} lines omitted]`);
  return truncated.join('\n');
}

function extractSummaryLine(review: string): string {
  const lines = review.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('<')) {
      return trimmed.replace(/\*\*/g, '').replace(/\*/g, '').slice(0, 120);
    }
  }
  return 'AI review complete.';
}

function parseCategories(review: string): ReviewCategory[] {
  const categories: ReviewCategory[] = [];
  const lines = review.split('\n');
  let currentCategory: string | null = null;
  let count = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentCategory !== null && count > 0) {
        categories.push({ name: currentCategory, count });
      }
      currentCategory = headingMatch[1].replace(/[*_`]/g, '').trim();
      count = 0;
    } else if (currentCategory && /^[-*]\s+/.test(line)) {
      // Skip bullets that state there are no issues — these are not findings
      const content = line.replace(/^[-*]\s+/, '').trim();
      if (!/^(no |none|nothing|n\/a)/i.test(content)) {
        count++;
      }
    }
  }
  if (currentCategory !== null && count > 0) {
    categories.push({ name: currentCategory, count });
  }
  return categories;
}

function determineVerdict(
  categories: ReviewCategory[],
  review: string,
): 'lgtm' | 'needs-work' | 'critical' {
  // Parse the explicit verdict line the prompt requests — most reliable signal
  const verdictMatch = review.match(/\*\*Review Verdict:\*\*\s*(.+)/i);
  if (verdictMatch) {
    const v = verdictMatch[1].trim().toLowerCase();
    if (v.includes('critical')) return 'critical';
    if (v.includes('needs work') || v.includes('needs-work')) return 'needs-work';
    if (v.includes('lgtm')) return 'lgtm';
  }

  // Fallback heuristics — only trigger on affirmative critical signals, not
  // negative mentions ("no critical issues", "there are no breaking changes")
  for (const line of review.split('\n')) {
    const lower = line.toLowerCase();
    if (/\b(no|not|without|none|zero)\b/.test(lower)) continue;
    if (/critical|security vulnerability|breaking change|must fix|high.?risk/.test(lower)) {
      return 'critical';
    }
  }

  const securityCat = categories.find(c => /security/i.test(c.name));
  const bugsCat = categories.find(c => /bug|error|issue|fix/i.test(c.name));
  if ((securityCat && securityCat.count > 0) || (bugsCat && bugsCat.count > 0)) return 'needs-work';

  const lgtmSignals = /looks good|lgtm|no issues|well.?written|clean implementation|no significant/i;
  if (lgtmSignals.test(review)) return 'lgtm';

  const totalIssues = categories.reduce((sum, c) => sum + c.count, 0);
  return totalIssues === 0 ? 'lgtm' : 'needs-work';
}

// ── Anti-hallucination validation ─────────────────────────────────────────────

/**
 * Extract metadata from a git diff to enable validation of AI responses
 */
function extractDiffMetadata(diff: string): DiffMetadata {
  const files: string[] = [];
  const fileExtensions = new Set<string>();
  let additions = 0;
  let deletions = 0;
  let totalLines = 0;

  const lines = diff.split('\n');
  
  for (const line of lines) {
    totalLines++;
    
    // Extract file names from diff headers
    const fileMatch = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (fileMatch) {
      const file = fileMatch[1].trim();
      files.push(file);
      const ext = file.split('.').pop();
      if (ext && ext !== file) {
        fileExtensions.add(ext);
      }
    }
    
    // Count additions and deletions
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return { files, additions, deletions, totalLines, fileExtensions };
}

/**
 * Validate AI review output to detect potential hallucinations
 */
function validateReview(review: string, metadata: DiffMetadata): string[] {
  const warnings: string[] = [];

  // Check 1: Verify mentioned files exist in the diff
  const mentionedFiles = extractMentionedFiles(review);
  for (const file of mentionedFiles) {
    const fileExists = metadata.files.some(f => 
      f === file || f.endsWith('/' + file) || file.includes(f)
    );
    if (!fileExists) {
      warnings.push(`AI mentioned file "${file}" which is not in the diff`);
    }
  }

  // Check 2: Detect suspiciously specific line numbers (high risk of hallucination)
  const lineNumberPattern = /\bline[s]?\s+(\d+)(?:\s*[-–]\s*(\d+))?\b/gi;
  const lineMatches = Array.from(review.matchAll(lineNumberPattern));
  if (lineMatches.length > 5) {
    warnings.push(`AI provided ${lineMatches.length} specific line references - verify accuracy`);
  }

  // Check 3: Check for references to code that seems too specific
  const codeBlockPattern = /`([^`]{50,})`/g;
  const longCodeRefs = Array.from(review.matchAll(codeBlockPattern));
  if (longCodeRefs.length > 3) {
    warnings.push(`AI quoted ${longCodeRefs.length} long code snippets - verify they match the actual diff`);
  }

  // Check 4: Detect vague or generic comments that might indicate hallucination
  const vaguePatterns = [
    /\b(may|might|could|possibly|potentially)\s+(cause|lead to|result in)\b/gi,
    /\b(consider|should|recommend|suggest)\s+(?:adding|implementing|using)\s+\w+\s+without/gi,
  ];
  
  let vagueCount = 0;
  for (const pattern of vaguePatterns) {
    const matches = Array.from(review.matchAll(pattern));
    vagueCount += matches.length;
  }
  
  if (vagueCount > 4) {
    warnings.push(`Review contains ${vagueCount} vague suggestions - may lack grounding in actual code`);
  }

  // Check 5: Verify the review isn't too long for the diff size
  const reviewLength = review.length;
  const diffSize = metadata.totalLines;
  const ratio = reviewLength / diffSize;
  
  if (ratio > 5 && diffSize < 100) {
    warnings.push(`Review is disproportionately long (${reviewLength} chars for ${diffSize} line diff) - may contain hallucinated detail`);
  }

  // Check 6: Check for common hallucination markers
  const hallucinationMarkers = [
    /as (?:mentioned|discussed|stated) (?:earlier|above|previously)/i,
    /(?:the|this) existing (?:function|method|class) \w+ (?:should|needs to|must)/i,
    /based on (?:the|your) (?:previous|earlier|existing) (?:implementation|code)/i,
  ];

  for (const marker of hallucinationMarkers) {
    if (marker.test(review)) {
      warnings.push(`Review contains potential hallucination marker: "${marker.source}"`);
    }
  }

  return warnings;
}

/**
 * Extract file names/paths mentioned in the review
 */
function extractMentionedFiles(review: string): string[] {
  const files = new Set<string>();
  
  // Match backtick-quoted paths (most reliable)
  const backtickPaths = review.matchAll(/`([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)`/g);
  for (const match of backtickPaths) {
    files.add(match[1]);
  }
  
  // Match markdown file headings
  const headingPaths = review.matchAll(/###?\s+`?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)`?/g);
  for (const match of headingPaths) {
    const file = match[1].replace(/`/g, '').trim();
    files.add(file);
  }
  
  return Array.from(files);
}

/**
 * Calculate the cost of API usage based on token counts and model pricing
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-6'];
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Extract token usage from Anthropic API response
 */
function extractUsage(message: Anthropic.Message, model: string): TokenUsage {
  const usage = message.usage;
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const totalTokens = inputTokens + outputTokens;
  
  const tokenUsage: TokenUsage = {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCost: calculateCost(inputTokens, outputTokens, model),
    model,
  };

  // Add cache token counts if available (prompt caching)
  if ('cache_creation_input_tokens' in usage && usage.cache_creation_input_tokens) {
    tokenUsage.cacheCreationTokens = usage.cache_creation_input_tokens;
  }
  if ('cache_read_input_tokens' in usage && usage.cache_read_input_tokens) {
    tokenUsage.cacheReadTokens = usage.cache_read_input_tokens;
  }

  return tokenUsage;
}

/**
 * Extract thinking/reasoning blocks from the API response
 */
function extractReasoning(message: Anthropic.Message): string[] {
  const reasoning: string[] = [];
  
  for (const block of message.content) {
    // Type guard to check if this is a thinking block
    if ('type' in block && block.type === 'thinking' && 'thinking' in block) {
      reasoning.push((block as any).thinking);
    }
  }
  
  return reasoning;
}

/**
 * Log reasoning output for transparency
 */
function logReasoning(reasoning: string[], context: string): void {
  if (reasoning.length === 0) return;
  
  console.log(`\n🧠 AI Reasoning — ${context}:`);
  reasoning.forEach((thought, idx) => {
    console.log(`\n--- Thought ${idx + 1} ---`);
    // Truncate very long reasoning to keep logs readable
    const display = thought.length > 500 ? thought.slice(0, 500) + '... [truncated]' : thought;
    console.log(display);
  });
  console.log('--- End reasoning ---\n');
}

/**
 * Log token usage and cost information
 */
function logUsage(usage: TokenUsage, context: string): void {
  console.log(`\n💰 Token Usage — ${context}:`);
  console.log(`  Model: ${usage.model}`);
  console.log(`  Input tokens: ${usage.inputTokens.toLocaleString()}`);
  console.log(`  Output tokens: ${usage.outputTokens.toLocaleString()}`);
  
  if (usage.cacheReadTokens) {
    console.log(`  Cache read tokens: ${usage.cacheReadTokens.toLocaleString()}`);
  }
  if (usage.cacheCreationTokens) {
    console.log(`  Cache creation tokens: ${usage.cacheCreationTokens.toLocaleString()}`);
  }
  
  console.log(`  Total tokens: ${usage.totalTokens.toLocaleString()}`);
  console.log(`  Estimated cost: $${usage.estimatedCost.toFixed(4)}`);
  console.log('');
}

