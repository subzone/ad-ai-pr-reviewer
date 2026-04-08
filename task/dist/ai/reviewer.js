"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewPullRequest = reviewPullRequest;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_DIFF_LINES = 500;
async function reviewPullRequest(apiKey, options) {
    const client = new sdk_1.default({ apiKey });
    const maxLines = options.maxDiffLines ?? DEFAULT_MAX_DIFF_LINES;
    const diff = truncateDiff(options.diff, maxLines);
    const systemPrompt = `You are an expert code reviewer. Your job is to review pull request diffs and provide constructive, actionable feedback.

Guidelines:
- Be concise and specific. Point to exact lines or patterns when possible.
- Prioritize: bugs and correctness > security issues > performance > style/readability.
- Acknowledge good patterns when you see them.
- Group feedback by category (e.g., Bugs, Security, Performance, Style).
- If the change is small or looks good, say so briefly — don't pad feedback.
- Use markdown formatting in your response.`;
    const userPrompt = buildUserPrompt(options, diff);
    const message = await client.messages.create({
        model: options.model ?? DEFAULT_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
    });
    const content = message.content[0];
    if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude API');
    }
    const reviewText = content.text;
    const summary = extractSummaryLine(reviewText);
    return {
        summary,
        fullComment: reviewText,
    };
}
function buildUserPrompt(options, diff) {
    const lines = [];
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
    lines.push('Please review this pull request. Structure your response with a brief overall summary first, then grouped findings.');
    return lines.join('\n');
}
function truncateDiff(diff, maxLines) {
    const lines = diff.split('\n');
    if (lines.length <= maxLines)
        return diff;
    const truncated = lines.slice(0, maxLines);
    truncated.push('');
    truncated.push(`... [diff truncated at ${maxLines} lines — ${lines.length - maxLines} lines omitted]`);
    return truncated.join('\n');
}
function extractSummaryLine(review) {
    // Take the first non-empty, non-heading line as the summary
    const lines = review.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
            // Strip markdown bold/italic markers for a clean summary
            return trimmed.replace(/\*\*/g, '').replace(/\*/g, '').slice(0, 120);
        }
    }
    return 'AI review complete.';
}
