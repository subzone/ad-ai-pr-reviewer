import * as tl from 'azure-pipelines-task-lib/task';
import { Provider, formatAiComment, formatManualComment } from './providers/base';
import { GitHubProvider } from './providers/github';
import { GitLabProvider } from './providers/gitlab';
import { BitbucketProvider } from './providers/bitbucket';
import { reviewPullRequest, AiProviderConfig, convertFindingsToComments } from './ai/reviewer';

async function run(): Promise<void> {
  try {
    // ── Inputs ───────────────────────────────────────────────────────────────
    const action = tl.getInput('action', true)!;
    const provider = tl.getInput('provider', true)!;
    const accessToken = tl.getInput('accessToken', true)!;
    const repository = tl.getInput('repository', true)!;
    const serverUrl = tl.getInput('serverUrl', false);

    const sourceBranch = tl.getInput('sourceBranch', false) ?? '';
    const targetBranch = tl.getInput('targetBranch', false) ?? 'main';
    const prTitle = tl.getInput('prTitle', false) ?? `${sourceBranch}: automated PR`;
    const prDescription = tl.getInput('prDescription', false) ?? '';
    const prNumberRaw = tl.getInput('prNumber', false);
    const commentBody = tl.getInput('commentBody', false) ?? '';
    const failOnExistingPR = tl.getBoolInput('failOnExistingPR', false);

    const enableAiReview = tl.getBoolInput('enableAiReview', false);
    const aiModel = tl.getInput('aiModel', false) ?? 'claude-sonnet-4-6';
    const aiReviewContext = tl.getInput('aiReviewContext', false) ?? '';
    const aiMaxDiffLines = parseInt(tl.getInput('aiMaxDiffLines', false) ?? '500', 10);
    const aiReviewMode = (tl.getInput('aiReviewMode', false) ?? 'standard') as 'standard' | 'per-file';
    const aiMaxFiles = parseInt(tl.getInput('aiMaxFiles', false) ?? '10', 10);
    const aiEnableReasoning = tl.getBoolInput('aiEnableReasoning', false);
    const aiEnableTools = tl.getBoolInput('aiEnableTools', false);
    const aiEnableSkills = tl.getBoolInput('aiEnableSkills', false);
    const aiSkills = tl.getInput('aiSkills', false) ?? 'security,performance';
    const aiSkillAutoDetect = tl.getBoolInput('aiSkillAutoDetect', false);
    const aiEnableInlineComments = tl.getBoolInput('aiEnableInlineComments', false);
    const repositoryPath = tl.getVariable('Build.SourcesDirectory') || process.cwd();

    // ── AI provider config ────────────────────────────────────────────────────
    const aiProviderConfig = enableAiReview
      ? buildAiProviderConfig()
      : null;

    // ── Git provider setup ────────────────────────────────────────────────────
    const providerInstance = buildProvider(provider, accessToken, serverUrl);

    // ── Action routing ───────────────────────────────────────────────────────
    switch (action) {
      case 'createPR':
        await handleCreatePR({
          provider: providerInstance,
          repository,
          sourceBranch,
          targetBranch,
          prTitle,
          prDescription,
          failOnExistingPR,
          enableAiReview,
          aiProviderConfig,
          aiModel,
          aiReviewContext,
          aiMaxDiffLines,
          aiReviewMode,
          aiMaxFiles,
          aiEnableReasoning,
          aiEnableTools,
          aiEnableSkills,
          aiSkills,
          aiSkillAutoDetect,
          aiEnableInlineComments,
          repositoryPath,
        });
        break;

      case 'reviewPR': {
        const prNumber = requirePrNumber(prNumberRaw);
        await handleReviewPR({
          provider: providerInstance,
          repository,
          prNumber,
          prTitle,
          prDescription,
          aiProviderConfig,
          aiModel,
          aiReviewContext,
          aiMaxDiffLines,
          aiReviewMode,
          aiMaxFiles,
          aiEnableReasoning,
          aiEnableTools,
          aiEnableSkills,
          aiSkills,
          aiSkillAutoDetect,
          aiEnableInlineComments,
          repositoryPath,
        });
        break;
      }

      case 'commentPR': {
        const prNumber = requirePrNumber(prNumberRaw);
        await handleCommentPR({
          provider: providerInstance,
          repository,
          prNumber,
          commentBody,
        });
        break;
      }

      default:
        tl.setResult(tl.TaskResult.Failed, `Unknown action: ${action}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    tl.setResult(tl.TaskResult.Failed, message);
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

interface CreatePRParams {
  provider: Provider;
  repository: string;
  sourceBranch: string;
  targetBranch: string;
  prTitle: string;
  prDescription: string;
  failOnExistingPR: boolean;
  enableAiReview: boolean;
  aiProviderConfig: AiProviderConfig | null;
  aiModel: string;
  aiReviewContext: string;
  aiMaxDiffLines: number;
  aiReviewMode: 'standard' | 'per-file';
  aiMaxFiles: number;
  aiEnableReasoning: boolean;
  aiEnableTools: boolean;
  aiEnableSkills: boolean;
  aiSkills: string;
  aiSkillAutoDetect: boolean;
  aiEnableInlineComments: boolean;
  repositoryPath: string;
}

async function handleCreatePR(params: CreatePRParams): Promise<void> {
  const {
    provider, repository, sourceBranch, targetBranch,
    prTitle, prDescription, failOnExistingPR,
    enableAiReview, aiProviderConfig, aiModel, aiReviewContext, aiMaxDiffLines,
    aiReviewMode, aiMaxFiles, aiEnableReasoning, aiEnableTools,
    aiEnableSkills, aiSkills, aiSkillAutoDetect, aiEnableInlineComments, repositoryPath,
  } = params;

  console.log(`Checking for existing PR: ${sourceBranch} → ${targetBranch} in ${repository}`);
  const existing = await provider.findExistingPR(repository, sourceBranch, targetBranch);

  if (existing) {
    if (failOnExistingPR) {
      tl.setResult(tl.TaskResult.Failed, `A PR already exists: ${existing.url}`);
      return;
    }
    console.log(`##[warning]PR already exists: ${existing.url}`);
    tl.setVariable('PrUrl', existing.url);
    tl.setVariable('PrNumber', String(existing.number));

    if (enableAiReview && aiProviderConfig) {
      await runAiReview({
        provider, repository, prNumber: existing.number,
        prTitle: existing.title, prDescription,
        aiProviderConfig, aiModel, aiReviewContext, aiMaxDiffLines, aiReviewMode, aiMaxFiles,
        aiEnableReasoning, aiEnableTools, aiEnableSkills, aiSkills, aiSkillAutoDetect,
        aiEnableInlineComments, repositoryPath,
      });
    }
    return;
  }

  console.log(`Creating PR "${prTitle}" (${sourceBranch} → ${targetBranch})`);
  const pr = await provider.createPR({
    repository, sourceBranch, targetBranch, title: prTitle, description: prDescription,
  });

  console.log(`PR created: ${pr.url}`);
  tl.setVariable('PrUrl', pr.url);
  tl.setVariable('PrNumber', String(pr.number));

  if (enableAiReview && aiProviderConfig) {
    await runAiReview({
      provider, repository, prNumber: pr.number,
      prTitle: pr.title, prDescription,
      aiProviderConfig, aiModel, aiReviewContext, aiMaxDiffLines, aiReviewMode, aiMaxFiles,
      aiEnableReasoning, aiEnableTools, aiEnableSkills, aiSkills, aiSkillAutoDetect,
      aiEnableInlineComments, repositoryPath,
    });
  }

  tl.setResult(tl.TaskResult.Succeeded, `PR created: ${pr.url}`);
}

interface ReviewPRParams {
  provider: Provider;
  repository: string;
  prNumber: number;
  prTitle: string;
  prDescription: string;
  aiProviderConfig: AiProviderConfig | null;
  aiModel: string;
  aiReviewContext: string;
  aiMaxDiffLines: number;
  aiReviewMode: 'standard' | 'per-file';
  aiMaxFiles: number;
  aiEnableReasoning: boolean;
  aiEnableTools: boolean;
  aiEnableSkills: boolean;
  aiSkills: string;
  aiSkillAutoDetect: boolean;
  aiEnableInlineComments: boolean;
  repositoryPath: string;
}

async function handleReviewPR(params: ReviewPRParams): Promise<void> {
  const { prNumber, aiProviderConfig } = params;

  if (!aiProviderConfig) {
    tl.setResult(tl.TaskResult.Failed, 'AI provider configuration is required for the reviewPR action.');
    return;
  }

  await runAiReview(params as AiReviewParams);
  tl.setResult(tl.TaskResult.Succeeded, `AI review posted on PR #${prNumber}`);
}

interface CommentPRParams {
  provider: Provider;
  repository: string;
  prNumber: number;
  commentBody: string;
}

async function handleCommentPR(params: CommentPRParams): Promise<void> {
  const { provider, repository, prNumber, commentBody } = params;

  if (!commentBody.trim()) {
    tl.setResult(tl.TaskResult.Failed, 'Comment text cannot be empty.');
    return;
  }

  const formatted = formatManualComment(commentBody);
  console.log(`Posting comment on PR #${prNumber}`);
  await provider.postComment({ repository, prNumber, body: formatted });
  tl.setResult(tl.TaskResult.Succeeded, `Comment posted on PR #${prNumber}`);
}

// ── AI review helper ──────────────────────────────────────────────────────────

interface AiReviewParams {
  provider: Provider;
  repository: string;
  prNumber: number;
  prTitle: string;
  prDescription: string;
  aiProviderConfig: AiProviderConfig;
  aiModel: string;
  aiReviewContext: string;
  aiMaxDiffLines: number;
  aiReviewMode: 'standard' | 'per-file';
  aiMaxFiles: number;
  aiEnableReasoning: boolean;
  aiEnableTools: boolean;
  aiEnableSkills: boolean;
  aiSkills: string;
  aiSkillAutoDetect: boolean;
  aiEnableInlineComments: boolean;
  repositoryPath: string;
}

async function runAiReview(params: AiReviewParams): Promise<void> {
  const {
    provider, repository, prNumber, prTitle, prDescription,
    aiProviderConfig, aiModel, aiReviewContext, aiMaxDiffLines, aiReviewMode, aiMaxFiles,
    aiEnableReasoning, aiEnableTools, aiEnableSkills, aiSkills, aiSkillAutoDetect,
    aiEnableInlineComments, repositoryPath,
  } = params;

  console.log(`Fetching diff for PR #${prNumber}...`);
  const diff = await provider.getDiff({ repository, prNumber });

  if (!diff.trim()) {
    console.log('##[warning]No diff found for this PR. Skipping AI review.');
    return;
  }

  const flags = [
    aiEnableReasoning ? 'reasoning' : null,
    aiEnableTools ? 'tools' : null,
    aiEnableSkills ? `skills(${aiSkills})` : null,
  ].filter(Boolean).join(', ');
  const flagsStr = flags ? ` (with ${flags})` : '';
  console.log(`Running AI review — provider: ${aiProviderConfig.provider}, mode: ${aiReviewMode}, model: ${aiModel}${flagsStr}`);
  
  // Parse skill IDs
  const { parseSkillIds } = require('./ai/skills');
  const skillIds = aiEnableSkills ? parseSkillIds(aiSkills) : [];
  
  const result = await reviewPullRequest(aiProviderConfig, {
    diff,
    prTitle,
    prDescription,
    additionalContext: aiReviewContext,
    model: aiModel,
    maxDiffLines: aiMaxDiffLines,
    reviewMode: aiReviewMode,
    maxFiles: aiMaxFiles,
    enableReasoning: aiEnableReasoning,
    enableTools: aiEnableTools,
    enableSkills: aiEnableSkills,
    skills: skillIds,
    skillAutoDetect: aiSkillAutoDetect,
    repositoryPath,
  });

  // Log validation warnings if present
  if (result.validationWarnings && result.validationWarnings.length > 0) {
    console.log(`##[warning]⚠️  AI Review Validation Warnings (${result.validationWarnings.length}):`);
    result.validationWarnings.forEach(w => console.log(`##[warning]  - ${w}`));
    tl.setVariable('ReviewHasWarnings', 'true');
    tl.setVariable('ReviewWarningCount', String(result.validationWarnings.length));
  } else {
    tl.setVariable('ReviewHasWarnings', 'false');
    tl.setVariable('ReviewWarningCount', '0');
  }

  // Export token usage and cost data
  if (result.usage) {
    tl.setVariable('ReviewInputTokens', String(result.usage.inputTokens));
    tl.setVariable('ReviewOutputTokens', String(result.usage.outputTokens));
    tl.setVariable('ReviewTotalTokens', String(result.usage.totalTokens));
    tl.setVariable('ReviewEstimatedCost', result.usage.estimatedCost.toFixed(4));
    tl.setVariable('ReviewModel', result.usage.model);
    
    if (result.usage.cacheReadTokens) {
      tl.setVariable('ReviewCacheReadTokens', String(result.usage.cacheReadTokens));
    }
    if (result.usage.cacheCreationTokens) {
      tl.setVariable('ReviewCacheCreationTokens', String(result.usage.cacheCreationTokens));
    }
  }

  const formattedComment = formatAiComment(result.fullComment);
  console.log(`Posting AI review comment: ${result.summary}`);
  await provider.postComment({ repository, prNumber, body: formattedComment });

  // Post inline comments if enabled and provider supports it
  if (aiEnableInlineComments && result.structuredFindings && result.structuredFindings.length > 0) {
    if (provider.postReviewComments) {
      console.log(`Converting ${result.structuredFindings.length} findings to inline comments...`);
      const comments = convertFindingsToComments(result.structuredFindings, diff);
      
      if (comments.length > 0) {
        console.log(`Posting ${comments.length} inline code comments...`);
        await provider.postReviewComments({
          repository,
          prNumber,
          comments,
          // Get commit SHA from the latest diff (some providers need it)
          commitId: undefined,  // Providers will fetch if needed
        });
        console.log(`✅ Posted ${comments.length} inline comments with code suggestions`);
      } else {
        console.log('⚠️  No inline comments could be created (line numbers not found in diff)');
      }
    } else {
      console.log('⚠️  Provider does not support inline comments, skipping');
    }
  } else if (aiEnableInlineComments && (!result.structuredFindings || result.structuredFindings.length === 0)) {
    console.log('ℹ️  No structured findings available for inline comments');
  }

  tl.setVariable('ReviewSummary', result.summary);
  tl.setVariable('ReviewVerdict', result.verdict);
  tl.setVariable('ReviewTotalIssues', String(result.totalIssues));
  for (const cat of result.categories) {
    const key = `Review_${cat.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    tl.setVariable(key, String(cat.count));
  }

  console.log(`AI review complete — verdict: ${result.verdict}, issues: ${result.totalIssues}`);
}

// ── AI provider config builder ────────────────────────────────────────────────

function buildAiProviderConfig(): AiProviderConfig {
  const aiProvider = (tl.getInput('aiProvider', false) ?? 'anthropic') as
    | 'anthropic' | 'azure' | 'litellm' | 'bedrock' | 'vertex';

  switch (aiProvider) {
    case 'anthropic': {
      const apiKey = tl.getInput('aiApiKey', false) ?? '';
      if (!apiKey) throw new Error('aiApiKey is required when using Anthropic as AI provider.');
      return { provider: 'anthropic', apiKey };
    }

    case 'azure': {
      const apiKey = tl.getInput('aiApiKey', false) ?? '';
      const baseUrl = tl.getInput('aiBaseUrl', false) ?? '';
      if (!apiKey) throw new Error('aiApiKey is required when using Azure (Azure OpenAI or Azure AI Foundry).');
      if (!baseUrl) throw new Error('aiBaseUrl is required when using Azure. For Azure OpenAI use your resource endpoint (e.g. https://<resource>.openai.azure.com). For Azure AI Foundry use the models endpoint (e.g. https://<resource>.services.ai.azure.com/models).');
      return { provider: 'azure', apiKey, baseUrl };
    }

    case 'litellm': {
      const apiKey = tl.getInput('aiApiKey', false) ?? '';
      const baseUrl = tl.getInput('aiBaseUrl', false) ?? '';
      if (!baseUrl) throw new Error('aiBaseUrl is required when using LiteLLM (your proxy URL).');
      return { provider: 'litellm', apiKey, baseUrl };
    }

    case 'bedrock': {
      const region = tl.getInput('awsRegion', false) ?? '';
      if (!region) throw new Error('awsRegion is required when using AWS Bedrock.');
      return {
        provider: 'bedrock',
        accessKeyId:     tl.getInput('awsAccessKeyId', false) ?? undefined,
        secretAccessKey: tl.getInput('awsSecretAccessKey', false) ?? undefined,
        region,
      };
    }

    case 'vertex': {
      const projectId = tl.getInput('gcpProjectId', false) ?? '';
      const region    = tl.getInput('gcpRegion', false) ?? '';
      if (!projectId) throw new Error('gcpProjectId is required when using Google Vertex AI.');
      if (!region)    throw new Error('gcpRegion is required when using Google Vertex AI (e.g. us-east5).');
      return { provider: 'vertex', projectId, region };
    }

    default:
      throw new Error(`Unknown AI provider: ${aiProvider}`);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function buildProvider(provider: string, accessToken: string, serverUrl?: string | null): Provider {
  const config = { accessToken, serverUrl: serverUrl ?? undefined };

  switch (provider) {
    case 'github':
      return new GitHubProvider(config);
    case 'gitlab':
      return new GitLabProvider(config);
    case 'bitbucket':
      return new BitbucketProvider(config, false);
    case 'bitbucket-server':
      if (!config.serverUrl) {
        throw new Error('Server URL is required for Bitbucket Server.');
      }
      return new BitbucketProvider(config, true);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

function requirePrNumber(raw: string | undefined | null): number {
  if (!raw || !raw.trim()) {
    throw new Error('Pull Request Number is required for this action.');
  }
  const num = parseInt(raw, 10);
  if (isNaN(num) || num <= 0) {
    throw new Error(`Invalid Pull Request Number: "${raw}"`);
  }
  return num;
}

run();
