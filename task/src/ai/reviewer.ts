import Anthropic from '@anthropic-ai/sdk';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import OpenAI, { AzureOpenAI } from 'openai';
import { callWithRetry } from './utils';

// ── Provider configuration ─────────────────────────────────────────────────────

export type AiProviderConfig =
  | { provider: 'anthropic';    apiKey: string }
  | { provider: 'azure';        apiKey: string; baseUrl: string }
  | { provider: 'litellm';      apiKey: string; baseUrl: string }
  | { provider: 'bedrock';      accessKeyId?: string; secretAccessKey?: string; region: string }
  | { provider: 'vertex';       projectId: string; region: string }
  | { provider: 'googleai';     apiKey: string }
  | { provider: 'githubmodels'; apiKey: string };

// Minimal duck-typed interface satisfied by Anthropic, AnthropicBedrock, and AnthropicVertex
type AnthropicLike = {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
};

// ── Azure Smart Adapter ────────────────────────────────────────────────────────

/** Returns true if the model is an Azure OpenAI model (GPT / O-series). */
export function isOpenAiModel(model: string): boolean {
  const lc = model.toLowerCase();
  return lc.startsWith('gpt-') || lc.startsWith('o1') || lc.startsWith('o3') || lc.startsWith('o4');
}

/**
 * Normalizes an Azure endpoint URL for use with the AzureOpenAI SDK.
 * Strips a trailing /openai or /openai/ suffix that users sometimes copy from the Azure portal,
 * since the SDK appends /openai/deployments/{model}/... itself.
 */
export function normalizeAzureEndpoint(baseUrl: string): string {
  return baseUrl.replace(/\/openai\/?$/, '');
}

/**
 * Adapter that wraps both the Anthropic SDK and the Azure OpenAI SDK behind the
 * common AnthropicLike interface.  It inspects `params.model` on every call and
 * routes accordingly:
 *   - Claude models  → Azure AI Foundry  (Anthropic Messages API format)
 *   - GPT / O-series → Azure OpenAI Service (OpenAI Chat Completions format)
 *
 * The Azure OpenAI baseUrl should be the resource endpoint, e.g.
 *   https://<resource>.openai.azure.com
 * or an APIM gateway URL that routes to Azure OpenAI.
 */
class AzureSmartAdapter {
  private readonly anthropicClient: Anthropic;
  private readonly openaiClient: AzureOpenAI;

  constructor(apiKey: string, baseUrl: string) {
    // Anthropic-compatible path (Azure AI Foundry / Claude deployments)
    this.anthropicClient = new Anthropic({
      apiKey,
      baseURL: baseUrl,
      defaultHeaders: { 'api-key': apiKey },
    });

    // OpenAI-compatible path (Azure OpenAI Service / GPT deployments)
    // Strip trailing /openai if present to avoid double-prefix when AzureOpenAI
    // constructs the full path: {endpoint}/openai/deployments/{model}/...
    const endpoint = normalizeAzureEndpoint(baseUrl);
    this.openaiClient = new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion: '2024-10-01-preview',
    });
  }

  readonly messages = {
    create: async (params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
      if (isOpenAiModel(params.model)) {
        return this.callOpenAI(params);
      }
      return this.anthropicClient.messages.create(params);
    },
  };

  private async callOpenAI(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    return callOpenAICompatible(this.openaiClient, params);
  }
}

// ── Shared OpenAI-compatible translation ───────────────────────────────────────

/**
 * Translates an Anthropic-format request to OpenAI Chat Completions and back.
 * Works with any OpenAI-compatible endpoint (AzureOpenAI is a subclass of OpenAI).
 */
async function callOpenAICompatible(
  client: OpenAI,
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
    const oaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    // System prompt
    if (params.system) {
      const text = typeof params.system === 'string'
        ? params.system
        : (params.system as Anthropic.TextBlockParam[]).map(b => b.text).join('\n');
      oaiMessages.push({ role: 'system', content: text });
    }

    // Conversation history
    for (const msg of params.messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          oaiMessages.push({ role: 'user', content: msg.content });
        } else {
          const blocks = msg.content as Anthropic.ContentBlockParam[];
          const toolResults = blocks.filter(b => b.type === 'tool_result') as Anthropic.ToolResultBlockParam[];
          const textBlocks  = blocks.filter(b => b.type === 'text') as Anthropic.TextBlockParam[];

          if (toolResults.length > 0) {
            for (const tr of toolResults) {
              const content = typeof tr.content === 'string'
                ? tr.content
                : (tr.content as Anthropic.TextBlockParam[] | undefined ?? []).map(b => b.text).join('\n');
              oaiMessages.push({ role: 'tool', tool_call_id: tr.tool_use_id, content });
            }
          }
          if (textBlocks.length > 0) {
            oaiMessages.push({ role: 'user', content: textBlocks.map(b => b.text).join('\n') });
          }
        }
      } else if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          oaiMessages.push({ role: 'assistant', content: msg.content });
        } else {
          const blocks    = msg.content as Anthropic.ContentBlock[];
          const textBlocks = blocks.filter(b => b.type === 'text') as Anthropic.TextBlock[];
          const toolUse    = blocks.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];

          const tool_calls: OpenAI.ChatCompletionMessageToolCall[] = toolUse.map(b => ({
            id: b.id,
            type: 'function' as const,
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          }));

          oaiMessages.push({
            role: 'assistant',
            content: textBlocks.length > 0 ? textBlocks.map(b => b.text).join('\n') : null,
            ...(tool_calls.length > 0 ? { tool_calls } : {}),
          });
        }
      }
    }

    // Tools
    const oaiTools: OpenAI.ChatCompletionTool[] | undefined = params.tools
      ? (params.tools as Anthropic.Tool[]).map(t => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
        }))
      : undefined;

    const response = await callWithRetry<OpenAI.ChatCompletion>(() =>
      client.chat.completions.create({
        model: params.model,
        messages: oaiMessages,
        max_tokens: params.max_tokens,
        ...(oaiTools ? { tools: oaiTools } : {}),
        stream: false,
      })
    );

    const choice = response.choices[0];
    const content: Anthropic.ContentBlock[] = [];

    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content } as Anthropic.TextBlock);
    }

    for (const tc of (choice.message.tool_calls ?? []).filter(t => t.type === 'function') as any[]) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.function.arguments ?? '{}'); } catch { /* ignore */ }
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input } as Anthropic.ToolUseBlock);
    }

    let stop_reason: Anthropic.Message['stop_reason'] = 'end_turn';
    if (choice.finish_reason === 'tool_calls') stop_reason = 'tool_use';
    else if (choice.finish_reason === 'length') stop_reason = 'max_tokens';

    return {
      id: response.id,
      type: 'message',
      role: 'assistant',
      model: params.model,
      content,
      stop_reason,
      stop_sequence: null,
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      },
    } as Anthropic.Message;
}

// ── OpenAI-compatible adapter ──────────────────────────────────────────────────

/**
 * Adapter for any OpenAI-compatible endpoint (Google AI Studio, GitHub Models, etc.).
 * Uses a plain OpenAI client with a custom baseURL and translates to/from the
 * Anthropic Messages API format used by the rest of the codebase.
 */
class OpenAICompatibleAdapter {
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  readonly messages = {
    create: (params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> =>
      callOpenAICompatible(this.client, params),
  };
}

function buildAiClient(config: AiProviderConfig): AnthropicLike {
  switch (config.provider) {
    case 'anthropic':
      return new Anthropic({ apiKey: config.apiKey });

    case 'azure':
      // AzureSmartAdapter routes Claude models to Azure AI Foundry (Anthropic-compatible)
      // and GPT/O-series models to Azure OpenAI Service (OpenAI-compatible).
      return new AzureSmartAdapter(config.apiKey, config.baseUrl);

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

    case 'googleai':
      // Google AI Studio — OpenAI-compatible endpoint for Gemini models.
      return new OpenAICompatibleAdapter(
        config.apiKey,
        'https://generativelanguage.googleapis.com/v1beta/openai/'
      );

    case 'githubmodels':
      // GitHub Models marketplace — OpenAI-compatible endpoint, API key is a GitHub PAT
      // with the models:read permission.
      return new OpenAICompatibleAdapter(
        config.apiKey,
        'https://models.inference.ai.azure.com'
      );
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
  enableTools?: boolean;  // Enable AI tool calling
  enableSkills?: boolean;  // Enable specialized review skills
  skills?: string[];  // Skill IDs to use (e.g., ['security', 'performance'])
  skillAutoDetect?: boolean;  // Auto-detect skills based on file patterns
  repositoryPath?: string;  // Path to checked-out repository for tool access
  skipPatterns?: string[];  // Glob patterns for files to skip
  priorityPatterns?: string[];  // Glob patterns for high-priority files
}

export interface ReviewCategory {
  name: string;
  count: number;
}

// Structured finding with mandatory citations
export interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'bug' | 'security' | 'performance' | 'style' | 'best-practice';
  title: string;
  description: string;
  file: string;
  diffLines?: string;  // Actual diff lines being referenced (e.g., "+  const password = req.body.password")
  suggestion?: string;
}

// Structured reasoning with analysis steps
export interface AnalysisStep {
  phase: string;  // e.g., "Initial Scan", "Security Analysis", "Pattern Detection"
  observation: string;
  conclusion: string;
}

export interface StructuredReview {
  summary: string;
  findings: Finding[];
  reasoning?: AnalysisStep[];
  metadata: {
    filesAnalyzed: string[];
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
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
  structuredFindings?: Finding[];  // New: structured data
}

interface DiffMetadata {
  files: string[];
  additions: number;
  deletions: number;
  totalLines: number;
  fileExtensions: Set<string>;
}

interface FileAnalysis {
  file: string;
  diff: string;
  additions: number;
  deletions: number;
  totalLines: number;
  isBinary: boolean;
  priority: number;  // Higher = more important
  skipReason?: string;  // If set, file should be skipped
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

// ── Tool Definitions ───────────────────────────────────────────────────────────

const CODE_READING_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_full_file',
    description: 'Read the complete contents of a file from the repository. Use this when you need to see the full context of a file beyond what\'s in the diff.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The repository-relative path to the file (e.g., "src/auth/login.ts")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file_section',
    description: 'Read a specific range of lines from a file. Use this when you need to see context around a specific area without loading the entire file.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The repository-relative path to the file',
        },
        start_line: {
          type: 'number',
          description: 'The starting line number (1-indexed)',
        },
        end_line: {
          type: 'number',
          description: 'The ending line number (1-indexed, inclusive)',
        },
      },
      required: ['path', 'start_line', 'end_line'],
    },
  },
  {
    name: 'search_codebase',
    description: 'Search for a pattern across the codebase. Returns file paths and line numbers where the pattern appears. Use this to find where functions/classes are defined or used.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The text pattern to search for (case-sensitive)',
        },
        file_pattern: {
          type: 'string',
          description: 'Optional glob pattern to limit search to specific files (e.g., "src/**/*.ts")',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'list_directory',
    description: 'List the contents of a directory in the repository. Use this to discover what files exist in a specific path.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The repository-relative directory path (e.g., "src/utils")',
        },
      },
      required: ['path'],
    },
  },
];

/**
 * Execute a tool call requested by the AI
 */
async function executeTool(
  toolName: string,
  toolInput: unknown,
  repositoryPath: string,
): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const util = await import('util');
  const exec = util.promisify((await import('child_process')).exec);

  try {
    switch (toolName) {
      case 'read_full_file': {
        const input = toolInput as { path: string };
        const filePath = path.join(repositoryPath, input.path);
        
        // Security: prevent path traversal
        const resolvedPath = path.resolve(filePath);
        const resolvedRepo = path.resolve(repositoryPath);
        if (!resolvedPath.startsWith(resolvedRepo)) {
          return `Error: Access denied - path outside repository: ${input.path}`;
        }
        
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          
          // Limit file size to prevent token overflow
          if (lines.length > 1000) {
            return `File is too large (${lines.length} lines). Use read_file_section to read specific sections.`;
          }
          
          // Add line numbers for reference
          const numberedContent = lines
            .map((line, idx) => `${String(idx + 1).padStart(4, ' ')}: ${line}`)
            .join('\n');
          
          return `File: ${input.path}\n\n${numberedContent}`;
        } catch (err) {
          return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      case 'read_file_section': {
        const input = toolInput as { path: string; start_line: number; end_line: number };
        const filePath = path.join(repositoryPath, input.path);
        
        // Security check
        const resolvedPath = path.resolve(filePath);
        const resolvedRepo = path.resolve(repositoryPath);
        if (!resolvedPath.startsWith(resolvedRepo)) {
          return `Error: Access denied - path outside repository`;
        }
        
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          
          const start = Math.max(0, input.start_line - 1);
          const end = Math.min(lines.length, input.end_line);
          
          if (start >= lines.length) {
            return `Error: start_line ${input.start_line} exceeds file length (${lines.length} lines)`;
          }
          
          const section = lines.slice(start, end);
          const numberedSection = section
            .map((line, idx) => `${String(start + idx + 1).padStart(4, ' ')}: ${line}`)
            .join('\n');
          
          return `File: ${input.path} (lines ${input.start_line}-${end})\n\n${numberedSection}`;
        } catch (err) {
          return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      case 'search_codebase': {
        const input = toolInput as { pattern: string; file_pattern?: string };
        
        try {
          // Use grep for fast searching
          // -r = recursive, -n = line numbers, -I = skip binary files
          const grepCmd = input.file_pattern
            ? `cd "${repositoryPath}" && grep -rn --include="${input.file_pattern}" "${input.pattern.replace(/"/g, '\\"')}" . || true`
            : `cd "${repositoryPath}" && grep -rn -I "${input.pattern.replace(/"/g, '\\"')}" . || true`;
          
          const { stdout } = await exec(grepCmd, { maxBuffer: 1024 * 1024 }); // 1MB limit
          
          if (!stdout.trim()) {
            return `No matches found for pattern: ${input.pattern}`;
          }
          
          // Limit results to prevent token overflow
          const lines = stdout.trim().split('\n');
          if (lines.length > 50) {
            const truncated = lines.slice(0, 50).join('\n');
            return `Found ${lines.length} matches (showing first 50):\n${truncated}`;
          }
          
          return `Found ${lines.length} matches:\n${stdout.trim()}`;
        } catch (err) {
          return `Error searching codebase: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      case 'list_directory': {
        const input = toolInput as { path: string };
        const dirPath = path.join(repositoryPath, input.path);
        
        // Security check
        const resolvedPath = path.resolve(dirPath);
        const resolvedRepo = path.resolve(repositoryPath);
        if (!resolvedPath.startsWith(resolvedRepo)) {
          return `Error: Access denied - path outside repository`;
        }
        
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          const formatted = entries
            .map(entry => entry.isDirectory() ? `${entry.name}/` : entry.name)
            .sort()
            .join('\n');
          
          return `Contents of ${input.path}:\n${formatted}`;
        } catch (err) {
          return `Error listing directory: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      default:
        return `Error: Unknown tool: ${toolName}`;
    }
  } catch (err) {
    return `Error executing tool: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Diff parsing utilities ─────────────────────────────────────────────────────

/**
 * Parse diff and extract line number for a specific diffLines text.
 * 
 * @param diff - Full unified diff content
 * @param file - File path (e.g., "src/auth/login.ts")
 * @param diffLineText - The actual diff line text (e.g., "+ const password = req.body.password")
 * @returns Line number in the new file version, or null if not found
 */
export function extractLineNumber(diff: string, file: string, diffLineText: string): number | null {
  const lines = diff.split('\n');
  let currentFile = '';
  let newLineNumber = 0;
  let inCorrectFile = false;

  // When diffLines spans multiple lines, use only the first non-empty line for matching
  const firstLine = diffLineText.split('\n').find(l => l.trim().length > 0) ?? diffLineText;

  // Normalize the search text (remove leading +/- and trim)
  const searchText = firstLine.replace(/^[+\- ]/, '').trim();

  // When a - line matches, record it and try to return the next + or context line instead
  let deletedLineMatch = false;

  for (const line of lines) {
    // Track current file
    if (line.startsWith('+++')) {
      const match = line.match(/^\+\+\+ b\/(.+)/);
      if (match) {
        currentFile = match[1];
        inCorrectFile = currentFile === file;
        newLineNumber = 0;
        deletedLineMatch = false;
      }
      continue;
    }

    if (!inCorrectFile) continue;

    // Parse diff chunk headers (@@ -10,5 +10,6 @@)
    if (line.startsWith('@@')) {
      const match = line.match(/@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (match) {
        newLineNumber = parseInt(match[1], 10) - 1;
        deletedLineMatch = false;
      }
      continue;
    }

    if (line.startsWith('+')) {
      newLineNumber++;
      const lineContent = line.substring(1).trim();
      // Direct match on added line
      if (lineContent === searchText) return newLineNumber;
      // Fallback: deleted line matched earlier — return the replacement + line
      if (deletedLineMatch) return newLineNumber;
    } else if (line.startsWith('-')) {
      const lineContent = line.substring(1).trim();
      if (lineContent === searchText) {
        // Mark that we matched a deleted line; next + or context line is the best anchor
        deletedLineMatch = true;
      }
    } else if (line.startsWith(' ')) {
      newLineNumber++;
      // Fallback: deleted line matched but no + line followed — use the context line
      if (deletedLineMatch) return newLineNumber;
    }
  }

  return null;  // Line not found
}

/**
 * Convert structured findings to inline review comments.
 * 
 * @param findings - Structured findings from AI review
 * @param diff - Full unified diff
 * @returns Array of review comments ready to post
 */
export function convertFindingsToComments(
  findings: Finding[],
  diff: string,
): Array<{ path: string; line: number; body: string; suggestion?: string }> {
  const comments: Array<{ path: string; line: number; body: string; suggestion?: string }> = [];

  for (const finding of findings) {
    // Skip findings without diffLines (can't create inline comment)
    if (!finding.diffLines || !finding.file) continue;

    // Extract line number from diff
    const lineNumber = extractLineNumber(diff, finding.file, finding.diffLines);
    if (lineNumber === null) {
      console.warn(`⚠️  Could not find line number for finding in ${finding.file}: ${finding.diffLines.substring(0, 50)}`);
      continue;
    }

    // Create comment body
    const severityEmoji = {
      critical: '🚨',
      high: '⚠️',
      medium: '💡',
      low: 'ℹ️',
      info: '📝',
    }[finding.severity];

    const categoryLabel = finding.category.replace(/-/g, ' ').toUpperCase();
    const body = `${severityEmoji} **${finding.severity.toUpperCase()} - ${categoryLabel}**\n\n**${finding.title}**\n\n${finding.description}`;

    comments.push({
      path: finding.file,
      line: lineNumber,
      body,
      suggestion: finding.suggestion,
    });
  }

  return comments;
}

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

  const message = await callWithRetry(() => client.messages.create(messageParams));

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
  
  // Intelligent file selection
  const { selected, skipped } = selectFilesToReview(files, options);
  
  // Log selection summary
  console.log(`\n📋 File Selection Summary:`);
  console.log(`  Total files in PR: ${files.length}`);
  console.log(`  Selected for review: ${selected.length}`);
  
  if (skipped.length > 0) {
    console.log(`  Skipped: ${skipped.length}`);
    
    // Group skipped files by reason
    const byReason = skipped.reduce((acc, { reason }) => {
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [reason, count] of Object.entries(byReason)) {
      console.log(`    - ${count} file(s): ${reason}`);
    }
    
    // Show individual skipped files if verbose
    if (skipped.length <= 5) {
      console.log(`\n  Skipped files:`);
      skipped.forEach(({ file, reason }) => {
        console.log(`    - ${file} (${reason})`);
      });
    }
  }
  
  // Show selected files with priorities
  console.log(`\n  Files to review (by priority):`);
  selected.forEach((analysis, idx) => {
    const badge = analysis.priority >= 70 ? '🔴' : analysis.priority >= 60 ? '🟠' : '🟢';
    console.log(`    ${idx + 1}. ${badge} ${analysis.file} (priority: ${analysis.priority}, +${analysis.additions}/-${analysis.deletions})`);
  });
  console.log('');

  const fileFindings: Array<{ file: string; findings: string }> = [];
  const allReasoning: string[] = [];
  const allStructuredFindings: Finding[] = [];
  let totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
    model: options.model ?? DEFAULT_MODEL,
  };
  
  // Check if skills mode is enabled
  const useSkills = options.enableSkills && options.skills && options.skills.length > 0;
  
  if (useSkills) {
    console.log(`\n🎯 Skills Mode: ${options.skills!.join(', ')}`);
    if (options.skillAutoDetect) {
      console.log(`   Auto-detection: enabled`);
    }
  }

  // Process files (with batching for parallel execution)
  const BATCH_SIZE = 2; // Process 2 files at a time to stay within rate limits
  const INTER_BATCH_DELAY_MS = 3_000; // 3s pause between batches to spread token usage
  const batches: FileAnalysis[][] = [];
  for (let i = 0; i < selected.length; i += BATCH_SIZE) {
    batches.push(selected.slice(i, i + BATCH_SIZE));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    console.log(`\n📦 Batch ${batchIdx + 1}/${batches.length}: Processing ${batch.length} file(s)...`);

    if (batchIdx > 0) {
      await new Promise(resolve => setTimeout(resolve, INTER_BATCH_DELAY_MS));
    }

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (analysis) => {
        if (useSkills) {
          return await reviewFileWithSkills(client, options, analysis);
        } else {
          const { findings, structuredFindings, reasoning, usage } = await reviewSingleFile(
            client,
            options,
            analysis.file,
            analysis.diff
          );
          return {
            file: analysis.file,
            findings,
            structuredFindings,
            reasoning,
            usage,
            skillResults: [],
          };
        }
      })
    );
    
    // Aggregate batch results
    for (const result of batchResults) {
      fileFindings.push({ file: result.file, findings: result.findings });

      if (result.structuredFindings && result.structuredFindings.length > 0) {
        allStructuredFindings.push(...result.structuredFindings);
      }

      if (result.reasoning && result.reasoning.length > 0) {
        allReasoning.push(`File: ${result.file}`, ...result.reasoning);
      }
      
      if (result.usage) {
        totalUsage.inputTokens += result.usage.inputTokens;
        totalUsage.outputTokens += result.usage.outputTokens;
        totalUsage.totalTokens += result.usage.totalTokens;
        totalUsage.estimatedCost += result.usage.estimatedCost;
        if (result.usage.cacheReadTokens) {
          totalUsage.cacheReadTokens = (totalUsage.cacheReadTokens || 0) + result.usage.cacheReadTokens;
        }
        if (result.usage.cacheCreationTokens) {
          totalUsage.cacheCreationTokens = (totalUsage.cacheCreationTokens || 0) + result.usage.cacheCreationTokens;
        }
      }
      
      console.log(`  ✓ reviewed: ${result.file}`);
    }
  }

  const { fullComment, reasoning: synthReasoning, usage: synthUsage } = 
    await synthesizeFindings(client, options, fileFindings, skipped.length);

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
  result.structuredFindings = allStructuredFindings;

  return result;
}

async function reviewSingleFile(
  client: AnthropicLike,
  options: ReviewOptions,
  file: string,
  diff: string,
): Promise<{ findings: string; structuredFindings: Finding[]; reasoning: string[]; usage: TokenUsage | null }> {
  const maxLines = options.maxDiffLines ?? DEFAULT_MAX_DIFF_LINES;
  const truncated = truncateDiff(diff, Math.floor(maxLines / 3));
  const model = options.model ?? DEFAULT_MODEL;

  // Enhanced system prompt with tool awareness
  const toolGuidance = options.enableTools && options.repositoryPath
    ? `\n\nTOOLS AVAILABLE:
You have access to these tools to gather additional context:
- read_full_file: Read the complete contents of any file in the repository
- read_file_section: Read a specific line range from a file
- search_codebase: Search for patterns across the entire codebase
- list_directory: List contents of a directory

USE TOOLS JUDICIOUSLY:
- Only use tools when needed for deeper understanding
- Prefer staying grounded in the visible diff
- Tool results add to token cost - use sparingly
- If unsure whether you need a tool, you probably don't

WHEN TO USE TOOLS:
✅ Need to see how a function is defined elsewhere
✅ Want to verify if tests exist for changed code
✅ Need to understand a complex type definition
✅ Looking for similar patterns in other files
❌ Just curious about unrelated code
❌ For issues already clear from the diff`
    : '';

  const system = `You are a precise code reviewer analyzing a single file's changes.

YOUR TASK: Analyze ONLY the visible diff and produce a structured JSON report.

CRITICAL RULES - Anti-Hallucination:
1. ONLY analyze lines that start with + or - in the diff
2. For EVERY finding, you MUST quote the exact diff line(s) being referenced
3. DO NOT reference code, functions, or variables not visible in the diff unless you used a tool to read them
4. DO NOT make assumptions about code outside the visible changes
5. If you cannot fully assess something from the visible diff, mark it as "info" severity with "Verify:" prefix${toolGuidance}

STRUCTURED OUTPUT REQUIRED:
Return ONLY a valid JSON object with this exact structure:

{
  "reasoning": [
    {
      "phase": "Initial Scan",
      "observation": "What I see in the diff",
      "conclusion": "What this means"
    },
    {
      "phase": "Security Analysis",
      "observation": "Security-relevant observations",
      "conclusion": "Security assessment"
    },
    {
      "phase": "Pattern Detection",
      "observation": "Patterns or anti-patterns found",
      "conclusion": "Impact and recommendations"
    }
  ],
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "bug|security|performance|style|best-practice",
      "title": "Brief title (max 60 chars)",
      "description": "Detailed explanation referencing visible diff",
      "file": "${file}",
      "diffLines": "Exact diff line(s) being discussed - MANDATORY",
      "suggestion": "How to fix (optional)"
    }
  ]
}

If no issues found, return:
{
  "reasoning": [{"phase": "Analysis", "observation": "Reviewed changes", "conclusion": "No issues found"}],
  "findings": []
}

SEVERITY GUIDELINES:
- critical: Security vulnerabilities, data loss, crashes
- high: Bugs that affect functionality
- medium: Performance issues, poor error handling
- low: Code quality, minor inefficiencies
- info: Things that need verification outside the visible diff`;

  const userPrompt = `## PR: ${options.prTitle}
${options.additionalContext ? `**Context:** ${options.additionalContext}` : ''}

## File: \`${file}\`

\`\`\`diff
${truncated}
\`\`\`

Analyze the above diff and return valid JSON following the schema.`;

  // When reasoning is enabled, max_tokens must be > budget_tokens
  // Use higher limit to accommodate thinking output + response
  const maxTokens = options.enableReasoning ? 4096 : 2048;

  const messageParams: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  };

  // Enable extended thinking if requested
  if (options.enableReasoning) {
    messageParams.thinking = {
      type: 'enabled',
      budget_tokens: 2048,
    };
  }

  // Enable tools if requested and repository path is available
  if (options.enableTools && options.repositoryPath) {
    messageParams.tools = CODE_READING_TOOLS;
  }

  // Tool calling loop - handle up to 5 iterations
  const MAX_TOOL_ITERATIONS = 5;
  let iteration = 0;
  let message: Anthropic.Message;
  const conversationHistory: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];
  let totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
    model,
  };
  const allReasoning: string[] = [];
  const toolCalls: Array<{ tool: string; input: unknown; result: string }> = [];

  while (iteration < MAX_TOOL_ITERATIONS) {
    messageParams.messages = conversationHistory;
    message = await callWithRetry(() => client.messages.create(messageParams));

    // Accumulate usage
    const iterationUsage = extractUsage(message, model);
    totalUsage.inputTokens += iterationUsage.inputTokens;
    totalUsage.outputTokens += iterationUsage.outputTokens;
    totalUsage.totalTokens += iterationUsage.totalTokens;
    totalUsage.estimatedCost += iterationUsage.estimatedCost;

    // Collect reasoning from this iteration
    const iterationReasoning = extractReasoning(message);
    if (iterationReasoning.length > 0) {
      allReasoning.push(...iterationReasoning);
    }

    // Check if the AI wants to use tools
    const hasToolUse = message.content.some(block => block.type === 'tool_use');
    
    if (!hasToolUse) {
      // No tool use - we're done
      break;
    }

    if (!options.repositoryPath) {
      console.log('⚠️  AI requested tools but repositoryPath not configured');
      break;
    }

    // Execute all tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    
    for (const block of message.content) {
      if (block.type === 'tool_use') {
        const toolName = block.name;
        const toolInput = block.input;
        const toolUseId = block.id;

        console.log(`\n🔧 Tool Call [${file}]: ${toolName}(${JSON.stringify(toolInput)})`);
        
        const result = await executeTool(toolName, toolInput, options.repositoryPath);
        
        // Limit result size to prevent token overflow
        const truncatedResult = result.length > 5000 
          ? result.substring(0, 5000) + '\n\n... (truncated)'
          : result;
        
        console.log(`📤 Tool Result: ${truncatedResult.substring(0, 200)}${truncatedResult.length > 200 ? '...' : ''}`);
        
        toolCalls.push({
          tool: toolName,
          input: toolInput,
          result: truncatedResult,
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: truncatedResult,
        });
      }
    }

    // Add assistant's tool use to conversation
    conversationHistory.push({
      role: 'assistant',
      content: message.content,
    });

    // Add tool results to conversation
    conversationHistory.push({
      role: 'user',
      content: toolResults,
    });

    iteration++;
  }

  if (iteration >= MAX_TOOL_ITERATIONS) {
    console.log(`⚠️  Reached max tool iterations (${MAX_TOOL_ITERATIONS}) for ${file}`);

    // If the last message has no text block the model hasn't produced its final summary yet.
    // Build a fresh single-turn request using the collected tool results rather than
    // replaying the conversation history, which avoids any tool_use/tool_result
    // pairing issues in the message array.
    const lastHasText = message!.content.some(b => b.type === 'text');
    if (!lastHasText) {
      console.log(`🔄 Requesting final summary for ${file} after tool iterations...`);

      const toolContext = toolCalls.length > 0
        ? '\n\n## Additional Context (gathered via tools)\n\n' +
          toolCalls.map(c =>
            `**${c.tool}(${JSON.stringify(c.input)}):**\n${c.result}`,
          ).join('\n\n')
        : '';

      try {
        const finalParams: Anthropic.MessageCreateParamsNonStreaming = {
          model,
          max_tokens: messageParams.max_tokens,
          system: messageParams.system as string,
          messages: [{ role: 'user', content: userPrompt + toolContext }],
          // no tools — forces a text response
        };
        message = await callWithRetry(() => client.messages.create(finalParams));

        const finalUsage = extractUsage(message, model);
        totalUsage.inputTokens += finalUsage.inputTokens;
        totalUsage.outputTokens += finalUsage.outputTokens;
        totalUsage.totalTokens += finalUsage.totalTokens;
        totalUsage.estimatedCost += finalUsage.estimatedCost;
      } catch (finalErr) {
        console.warn(
          `⚠️  Final summary request failed for ${file}: ` +
          `${finalErr instanceof Error ? finalErr.message : String(finalErr)}`,
        );
        // message still has no text block — extractText returns '' → parseStructuredResponse fallback
      }
    }
  }

  // Log final reasoning
  if (allReasoning.length > 0) {
    logReasoning(allReasoning, `File: ${file}`);
  }

  // Log tool usage summary
  if (toolCalls.length > 0) {
    console.log(`\n🛠️  Tool Usage Summary [${file}]:`);
    const byTool = toolCalls.reduce((acc, call) => {
      acc[call.tool] = (acc[call.tool] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    for (const [tool, count] of Object.entries(byTool)) {
      console.log(`  - ${tool}: ${count} call(s)`);
    }
  }

  const responseText = extractText(message!);
  
  // Parse and validate JSON response
  const structured = parseStructuredResponse(responseText, file);
  
  // Log structured reasoning steps
  if (structured.reasoning && structured.reasoning.length > 0) {
    console.log(`\n📊 Structured Analysis — ${file}:`);
    structured.reasoning.forEach((step, idx) => {
      console.log(`\n[${step.phase}]`);
      console.log(`  Observation: ${step.observation}`);
      console.log(`  Conclusion: ${step.conclusion}`);
    });
    console.log('');
  }

  // Convert structured findings to markdown
  const markdown = structuredToMarkdown(structured, file);

  return {
    findings: markdown,
    structuredFindings: structured.findings,
    reasoning: allReasoning,
    usage: totalUsage,
  };
}

// ── Skills-based Review ────────────────────────────────────────────────────────

async function reviewFileWithSkills(
  client: AnthropicLike,
  options: ReviewOptions,
  fileAnalysis: FileAnalysis,
): Promise<{
  file: string;
  findings: string;
  structuredFindings: Finding[];
  reasoning: string[];
  usage: TokenUsage | null;
  skillResults: any[];
}> {
  const { selectSkillsForFile, executeSkillsParallel, mergeSkillResults } = require('./skills');
  
  const { file, diff } = fileAnalysis;
  
  // Select skills for this file
  const requestedSkills = options.skills || [];
  const selectedSkills = selectSkillsForFile(
    file,
    diff,
    requestedSkills,
    options.skillAutoDetect ?? true
  );
  
  if (selectedSkills.length === 0) {
    // No skills matched - fall back to general review
    console.log(`  [${file}] No skills matched, using general review`);
    const result = await reviewSingleFile(client, options, file, diff);
    return {
      file,
      findings: result.findings,
      structuredFindings: result.structuredFindings,
      reasoning: result.reasoning,
      usage: result.usage,
      skillResults: [],
    };
  }
  
  // Execute skills in parallel
  const skillResults = await executeSkillsParallel(
    selectedSkills,
    file,
    diff,
    client,
    {
      model: options.model,
      enableReasoning: options.enableReasoning,
      enableTools: options.enableTools,
      repositoryPath: options.repositoryPath,
      prTitle: options.prTitle,
      additionalContext: options.additionalContext,
    }
  );
  
  // Merge results
  const merged = mergeSkillResults(skillResults);
  
  // Convert to markdown
  const markdown = formatSkillFindings(merged, file);
  
  // Aggregate token usage
  const totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: merged.totalTokens,
    estimatedCost: 0, // Will be calculated after aggregating input/output
    model: options.model ?? DEFAULT_MODEL,
  };
  
  for (const result of skillResults) {
    if (result.tokenUsage) {
      totalUsage.inputTokens += result.tokenUsage.inputTokens;
      totalUsage.outputTokens += result.tokenUsage.outputTokens;
    }
  }
  
  // Calculate accurate cost now that we have input/output tokens
  totalUsage.estimatedCost = calculateCost(
    totalUsage.inputTokens,
    totalUsage.outputTokens,
    options.model ?? DEFAULT_MODEL
  );
  
  // Aggregate reasoning
  const allReasoning: string[] = [];
  for (const result of skillResults) {
    if (result.reasoning && result.reasoning.length > 0) {
      allReasoning.push(`[${result.skillName}]`, ...result.reasoning);
    }
  }
  
  // Log skill performance
  console.log(`  [${file}] Skills Summary:`);
  for (const result of skillResults) {
    const qualityPct = (result.qualityMetrics.qualityRate * 100).toFixed(0);
    console.log(`    - ${result.skillName}: ${result.findings.length} findings (${qualityPct}% quality, ${result.executionTime}ms)`);
  }
  
  return {
    file,
    findings: markdown,
    structuredFindings: merged.allFindings as Finding[],
    reasoning: allReasoning,
    usage: totalUsage,
    skillResults,
  };
}

/**
 * Format skill findings into markdown
 */
function formatSkillFindings(merged: any, file: string): string {
  const lines: string[] = [];
  
  if (merged.allFindings.length === 0) {
    return `### \`${file}\`\n\n✅ No issues found by skills.\n`;
  }
  
  lines.push(`### \`${file}\`\n`);
  
  // Group by severity
  const bySeverity: Record<string, any[]> = {};
  for (const finding of merged.allFindings) {
    if (!bySeverity[finding.severity]) {
      bySeverity[finding.severity] = [];
    }
    bySeverity[finding.severity].push(finding);
  }
  
  const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
  
  for (const severity of severityOrder) {
    const findings = bySeverity[severity];
    if (!findings || findings.length === 0) continue;
    
    const emoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️',
    }[severity] || '•';
    
    for (const finding of findings) {
      lines.push(`${emoji} **[${finding.category}]** ${finding.title}`);
      lines.push(`  ${finding.description}`);
      
      if (finding.diffLines) {
        lines.push(`  \`\`\`diff`);
        lines.push(`  ${finding.diffLines}`);
        lines.push(`  \`\`\``);
      }
      
      if (finding.suggestion) {
        lines.push(`  💡 *Suggestion:* ${finding.suggestion}`);
      }
      
      lines.push('');
    }
  }
  
  return lines.join('\n').trim();
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

  const message = await callWithRetry(() => client.messages.create(messageParams));

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

// ── Intelligent file selection ────────────────────────────────────────────────

// Default patterns for files that should typically be skipped
const DEFAULT_SKIP_PATTERNS = [
  // Lock files and dependencies
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Gemfile.lock', 'Cargo.lock', 'go.sum', 'poetry.lock',
  // Minified/bundled files
  '*.min.js', '*.min.css', '*.bundle.js', '*.chunk.js',
  // Generated documentation
  'docs/api/**', 'docs/generated/**',
  // Build artifacts
  'dist/**', 'build/**', 'out/**', 'target/**', '.next/**',
  // IDE files
  '.vscode/**', '.idea/**', '*.iml',
  // Binary/media files (usually detected by diff, but patterns as backup)
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.ico', '*.pdf', '*.zip', '*.tar.gz',
];

// Default patterns for high-priority files
const DEFAULT_PRIORITY_PATTERNS = [
  // Security-sensitive
  '**/*auth*', '**/*password*', '**/*crypto*', '**/*security*', '**/*permission*',
  // Core configuration
  '*.config.js', '*.config.ts', 'Dockerfile', 'docker-compose.yml',
  // Infrastructure as code
  '*.tf', '*.tfvars', 'cloudformation/**', 'terraform/**',
  // Database migrations
  '**/migrations/**', '**/migrate/**',
];

/**
 * Analyze a file's diff to determine if it should be reviewed and its priority
 */
function analyzeFile(
  fileEntry: { file: string; diff: string },
  options: ReviewOptions,
): FileAnalysis {
  const { file, diff } = fileEntry;
  
  const lines = diff.split('\n');
  let additions = 0;
  let deletions = 0;
  let totalLines = lines.length;
  let isBinary = false;
  
  // Count additions/deletions and detect binary
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    } else if (line.includes('Binary files') || line.includes('GIT binary patch')) {
      isBinary = true;
    }
  }
  
  const analysis: FileAnalysis = {
    file,
    diff,
    additions,
    deletions,
    totalLines,
    isBinary,
    priority: 50,  // Default priority
  };
  
  // Check for skip conditions
  const skipReason = getSkipReason(file, analysis, options);
  if (skipReason) {
    analysis.skipReason = skipReason;
    return analysis;
  }
  
  // Calculate priority
  analysis.priority = calculatePriority(file, analysis, options);
  
  return analysis;
}

/**
 * Determine if a file should be skipped and why
 */
function getSkipReason(
  file: string,
  analysis: FileAnalysis,
  options: ReviewOptions,
): string | undefined {
  // Binary files
  if (analysis.isBinary) {
    return 'binary file';
  }
  
  // Very large files (>2000 lines changed)
  const totalChanges = analysis.additions + analysis.deletions;
  if (totalChanges > 2000) {
    return `too large (${totalChanges} lines changed)`;
  }
  
  // Check custom skip patterns
  const skipPatterns = options.skipPatterns || [];
  for (const pattern of skipPatterns) {
    if (matchesPattern(file, pattern)) {
      return `matches skip pattern: ${pattern}`;
    }
  }
  
  // Check default skip patterns
  for (const pattern of DEFAULT_SKIP_PATTERNS) {
    if (matchesPattern(file, pattern)) {
      return `generated/dependency file`;
    }
  }
  
  return undefined;
}

/**
 * Calculate priority score for a file (0-100, higher = more important)
 */
function calculatePriority(
  file: string,
  analysis: FileAnalysis,
  options: ReviewOptions,
): number {
  let priority = 50;  // Base priority
  
  // Custom priority patterns (highest weight)
  const priorityPatterns = options.priorityPatterns || [];
  for (const pattern of priorityPatterns) {
    if (matchesPattern(file, pattern)) {
      priority += 40;
      break;
    }
  }
  
  // Default high-priority patterns
  for (const pattern of DEFAULT_PRIORITY_PATTERNS) {
    if (matchesPattern(file, pattern)) {
      priority += 30;
      break;
    }
  }
  
  // Security-sensitive keywords in path
  if (/auth|password|crypto|security|permission|token|secret/i.test(file)) {
    priority += 20;
  }
  
  // Configuration files are important
  if (/\.config\.|Dockerfile|docker-compose|\.tf|\.tfvars|\.env/i.test(file)) {
    priority += 15;
  }
  
  // Core source files (not tests)
  if (/\.(ts|js|py|go|rs|java|rb|php)$/.test(file) && !/test|spec|mock/i.test(file)) {
    priority += 10;
  }
  
  // SQL/migration files
  if (/\.sql$|migration|migrate/i.test(file)) {
    priority += 15;
  }
  
  // Test files are lower priority
  if (/test|spec|mock|__tests__/i.test(file)) {
    priority -= 10;
  }
  
  // Documentation is lower priority
  if (file.startsWith('docs/') || file.endsWith('.md')) {
    priority -= 5;
  }
  
  return Math.max(0, Math.min(100, priority));
}

/**
 * Simple glob-style pattern matching
 */
function matchesPattern(file: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLESTAR___/g, '.*')
    .replace(/\./g, '\\.')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(file);
}

/**
 * Select files to review with intelligent prioritization
 */
function selectFilesToReview(
  files: Array<{ file: string; diff: string }>,
  options: ReviewOptions,
): {
  selected: FileAnalysis[];
  skipped: Array<{ file: string; reason: string }>;
} {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  
  // Analyze all files
  const analyzed = files.map(f => analyzeFile(f, options));
  
  // Separate skipped files
  const skipped: Array<{ file: string; reason: string }> = [];
  const reviewable: FileAnalysis[] = [];
  
  for (const analysis of analyzed) {
    if (analysis.skipReason) {
      skipped.push({ file: analysis.file, reason: analysis.skipReason });
    } else {
      reviewable.push(analysis);
    }
  }
  
  // Sort reviewable files by priority (highest first)
  reviewable.sort((a, b) => b.priority - a.priority);
  
  // Take top N files
  const selected = reviewable.slice(0, maxFiles);
  
  // Add remaining reviewable files to skipped
  for (const file of reviewable.slice(maxFiles)) {
    skipped.push({ file: file.file, reason: 'exceeded max files limit' });
  }
  
  return { selected, skipped };
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
  console.warn('⚠️  No text content found in AI response — using empty fallback');
  return '';
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

  if (ratio > 150 && diffSize < 100 && reviewLength > 2000) {
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

// ── Structured output processing ──────────────────────────────────────────────

/**
 * Parse and validate structured JSON response from AI
 */
function parseStructuredResponse(responseText: string, file: string): StructuredReview {
  try {
    // Try to extract JSON from response (may be wrapped in markdown code blocks)
    let jsonText = responseText.trim();
    
    // Remove markdown code fences if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*\n/, '').replace(/\n```\s*$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '');
    }
    
    const parsed = JSON.parse(jsonText);
    
    // Validate structure
    if (!parsed.findings || !Array.isArray(parsed.findings)) {
      console.warn(`⚠️  Invalid JSON structure for ${file}, using fallback`);
      return createFallbackStructure(responseText, file);
    }
    
    // Ensure all findings have required fields
    const findings: Finding[] = parsed.findings.map((f: any) => ({
      severity: f.severity || 'info',
      category: f.category || 'style',
      title: f.title || 'Issue',
      description: f.description || '',
      file: f.file || file,
      diffLines: f.diffLines || f.diff_lines,  // Support snake_case too
      suggestion: f.suggestion,
    }));
    
    // Build metadata
    const severityCounts = findings.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      summary: parsed.summary || 'Review complete',
      findings,
      reasoning: parsed.reasoning || [],
      metadata: {
        filesAnalyzed: [file],
        totalFindings: findings.length,
        criticalCount: severityCounts.critical || 0,
        highCount: severityCounts.high || 0,
        mediumCount: severityCounts.medium || 0,
        lowCount: severityCounts.low || 0,
      },
    };
  } catch (error) {
    console.warn(`⚠️  Failed to parse JSON for ${file}:`, error instanceof Error ? error.message : String(error));
    return createFallbackStructure(responseText, file);
  }
}

/**
 * Create fallback structure when JSON parsing fails
 */
function createFallbackStructure(text: string, file: string): StructuredReview {
  return {
    summary: 'Review completed (fallback mode)',
    findings: [],
    reasoning: [{
      phase: 'Fallback',
      observation: 'JSON parsing failed',
      conclusion: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
    }],
    metadata: {
      filesAnalyzed: [file],
      totalFindings: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
  };
}

/**
 * Convert structured findings to markdown format
 */
function structuredToMarkdown(structured: StructuredReview, file: string): string {
  if (structured.findings.length === 0) {
    return 'No issues.';
  }
  
  const lines: string[] = [];
  
  // Group by severity
  const bySeverity: Record<string, Finding[]> = {};
  for (const finding of structured.findings) {
    const sev = finding.severity;
    if (!bySeverity[sev]) bySeverity[sev] = [];
    bySeverity[sev].push(finding);
  }
  
  // Output in severity order
  const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
  for (const severity of severityOrder) {
    const findings = bySeverity[severity];
    if (!findings || findings.length === 0) continue;
    
    const emoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️',
    }[severity] || '•';
    
    for (const finding of findings) {
      lines.push(`${emoji} **[${finding.category}]** ${finding.title}`);
      lines.push(`  ${finding.description}`);
      
      if (finding.diffLines) {
        lines.push(`  \`\`\`diff`);
        lines.push(`  ${finding.diffLines}`);
        lines.push(`  \`\`\``);
      }
      
      if (finding.suggestion) {
        lines.push(`  💡 *Suggestion:* ${finding.suggestion}`);
      }
      
      lines.push('');
    }
  }
  
  return lines.join('\n').trim();
}

/**
 * Validate structured findings against diff
 */
function validateStructuredFindings(findings: Finding[], diff: string): string[] {
  const warnings: string[] = [];
  
  for (const finding of findings) {
    // Check 1: If diffLines is provided, verify it exists in the actual diff
    if (finding.diffLines) {
      const quotedLine = finding.diffLines.trim();
      if (!diff.includes(quotedLine)) {
        warnings.push(`Finding "${finding.title}" quotes diff line not in actual diff: "${quotedLine.slice(0, 50)}..."`);
      }
    } else if (finding.severity !== 'info') {
      // Check 2: Non-info findings should have diffLines citations
      warnings.push(`Finding "${finding.title}" lacks diff line citation (severity: ${finding.severity})`);
    }
  }
  
  return warnings;
}

