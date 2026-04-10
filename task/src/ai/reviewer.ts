import Anthropic from '@anthropic-ai/sdk';

export interface ReviewOptions {
  diff: string;
  prTitle: string;
  prDescription?: string;
  additionalContext?: string;
  model?: string;
  maxDiffLines?: number;
  reviewMode?: 'standard' | 'per-file';
  maxFiles?: number;
}

export interface ReviewCategory {
  name: string;
  count: number;
}

export interface ReviewResult {
  summary: string;
  fullComment: string;
  categories: ReviewCategory[];
  verdict: 'lgtm' | 'needs-work' | 'critical';
  totalIssues: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_DIFF_LINES = 500;
const DEFAULT_MAX_FILES = 10;

export async function reviewPullRequest(
  apiKey: string,
  options: ReviewOptions,
): Promise<ReviewResult> {
  const client = new Anthropic({ apiKey });

  if (options.reviewMode === 'per-file') {
    return reviewPerFile(client, options);
  }
  return reviewStandard(client, options);
}

// ── Standard mode ─────────────────────────────────────────────────────────────
// Single API call with the full diff, truncated if needed.

async function reviewStandard(
  client: Anthropic,
  options: ReviewOptions,
): Promise<ReviewResult> {
  const maxLines = options.maxDiffLines ?? DEFAULT_MAX_DIFF_LINES;
  const diff = truncateDiff(options.diff, maxLines);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildStandardPrompt(options, diff);

  const message = await client.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const reviewText = extractText(message);
  return buildResult(reviewText);
}

// ── Per-file mode ─────────────────────────────────────────────────────────────
// Each changed file gets its own focused review call, then a synthesis call
// combines all findings into one holistic assessment.

async function reviewPerFile(
  client: Anthropic,
  options: ReviewOptions,
): Promise<ReviewResult> {
  const files = splitDiffByFile(options.diff);
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const filesToReview = files.slice(0, maxFiles);
  const skipped = files.length - filesToReview.length;

  console.log(`Per-file review: ${filesToReview.length} files${skipped > 0 ? ` (${skipped} skipped — limit ${maxFiles})` : ''}`);

  // Step 1: review each file individually
  const fileFindings: Array<{ file: string; findings: string }> = [];
  for (const { file, diff } of filesToReview) {
    const findings = await reviewSingleFile(client, options, file, diff);
    fileFindings.push({ file, findings });
    console.log(`  reviewed: ${file}`);
  }

  // Step 2: synthesize all per-file findings into one integral assessment
  const fullComment = await synthesizeFindings(client, options, fileFindings, skipped);
  return buildResult(fullComment);
}

async function reviewSingleFile(
  client: Anthropic,
  options: ReviewOptions,
  file: string,
  diff: string,
): Promise<string> {
  const maxLines = options.maxDiffLines ?? DEFAULT_MAX_DIFF_LINES;
  const truncated = truncateDiff(diff, Math.floor(maxLines / 3));

  const system = `You are reviewing a single file's changes in a pull request.
Focus ONLY on this file. Be concise — list only real issues as bullet points.
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

  const message = await client.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content: user }],
  });

  return extractText(message);
}

async function synthesizeFindings(
  client: Anthropic,
  options: ReviewOptions,
  fileFindings: Array<{ file: string; findings: string }>,
  skippedFiles: number,
): Promise<string> {
  const fileSections = fileFindings.map(({ file, findings }) =>
    `### \`${file}\`\n${findings}`,
  ).join('\n\n');

  const skippedNote = skippedFiles > 0
    ? `\n\n> Note: ${skippedFiles} file(s) were not individually reviewed (limit reached).`
    : '';

  const system = `You are synthesizing per-file code review findings into an integral PR assessment.
Your job:
1. Write a brief overall summary (2-3 sentences)
2. Flag any cross-file issues (e.g. interface changed in one file but callers not updated)
3. Note any patterns across multiple files (e.g. consistent missing error handling)
4. Group all findings under: Bugs, Security, Performance, Style
5. Give a final verdict: LGTM, Needs Work, or Critical Issues

Use markdown. Be direct. Do not repeat per-file findings verbatim — synthesize them.`;

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

  const message = await client.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const synthesis = extractText(message);

  // Append the per-file breakdown as a collapsible section
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

  return synthesis + perFileSection;
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

Guidelines:
- Be concise and specific. Point to exact lines or patterns when possible.
- Prioritize: bugs and correctness > security issues > performance > style/readability.
- Acknowledge good patterns when you see them.
- Group feedback by category (e.g., Bugs, Security, Performance, Style).
- If the change is small or looks good, say so briefly — don't pad feedback.
- Use markdown formatting in your response.`;
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
  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude API');
  }
  return content.text;
}

function buildResult(reviewText: string): ReviewResult {
  const summary = extractSummaryLine(reviewText);
  const categories = parseCategories(reviewText);
  const totalIssues = categories.reduce((sum, c) => sum + c.count, 0);
  const verdict = determineVerdict(categories, reviewText);
  return { summary, fullComment: reviewText, categories, verdict, totalIssues };
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
      count++;
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
  const criticalSignals = /critical|security vulnerability|breaking change|must fix|high.?risk/i;
  if (criticalSignals.test(review)) return 'critical';

  const securityCat = categories.find(c => /security/i.test(c.name));
  const bugsCat = categories.find(c => /bug|error|issue|fix/i.test(c.name));
  if ((securityCat && securityCat.count > 0) || (bugsCat && bugsCat.count > 0)) return 'needs-work';

  const lgtmSignals = /looks good|lgtm|no issues|well.?written|clean implementation|no significant/i;
  if (lgtmSignals.test(review)) return 'lgtm';

  const totalIssues = categories.reduce((sum, c) => sum + c.count, 0);
  return totalIssues === 0 ? 'lgtm' : 'needs-work';
}
