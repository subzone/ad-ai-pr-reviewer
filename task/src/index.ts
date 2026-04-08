import * as tl from 'azure-pipelines-task-lib/task';
import { Provider, formatAiComment, formatManualComment } from './providers/base';
import { GitHubProvider } from './providers/github';
import { GitLabProvider } from './providers/gitlab';
import { BitbucketProvider } from './providers/bitbucket';
import { reviewPullRequest } from './ai/reviewer';

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
    const aiApiKey = tl.getInput('aiApiKey', false) ?? '';
    const aiModel = tl.getInput('aiModel', false) ?? 'claude-sonnet-4-6';
    const aiReviewContext = tl.getInput('aiReviewContext', false) ?? '';
    const aiMaxDiffLines = parseInt(tl.getInput('aiMaxDiffLines', false) ?? '500', 10);

    // ── Provider setup ───────────────────────────────────────────────────────
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
          aiApiKey,
          aiModel,
          aiReviewContext,
          aiMaxDiffLines,
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
          aiApiKey,
          aiModel,
          aiReviewContext,
          aiMaxDiffLines,
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
  aiApiKey: string;
  aiModel: string;
  aiReviewContext: string;
  aiMaxDiffLines: number;
}

async function handleCreatePR(params: CreatePRParams): Promise<void> {
  const {
    provider, repository, sourceBranch, targetBranch,
    prTitle, prDescription, failOnExistingPR,
    enableAiReview, aiApiKey, aiModel, aiReviewContext, aiMaxDiffLines,
  } = params;

  // Check for existing PR first
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

    if (enableAiReview) {
      await runAiReview({
        provider, repository, prNumber: existing.number,
        prTitle: existing.title, prDescription,
        aiApiKey, aiModel, aiReviewContext, aiMaxDiffLines,
      });
    }
    return;
  }

  // Create the PR
  console.log(`Creating PR "${prTitle}" (${sourceBranch} → ${targetBranch})`);
  const pr = await provider.createPR({
    repository, sourceBranch, targetBranch, title: prTitle, description: prDescription,
  });

  console.log(`PR created: ${pr.url}`);
  tl.setVariable('PrUrl', pr.url);
  tl.setVariable('PrNumber', String(pr.number));

  if (enableAiReview) {
    await runAiReview({
      provider, repository, prNumber: pr.number,
      prTitle: pr.title, prDescription,
      aiApiKey, aiModel, aiReviewContext, aiMaxDiffLines,
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
  aiApiKey: string;
  aiModel: string;
  aiReviewContext: string;
  aiMaxDiffLines: number;
}

async function handleReviewPR(params: ReviewPRParams): Promise<void> {
  const { provider, repository, prNumber, aiApiKey } = params;

  if (!aiApiKey) {
    tl.setResult(tl.TaskResult.Failed, 'AI API Key is required for the reviewPR action.');
    return;
  }

  await runAiReview(params);
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
  aiApiKey: string;
  aiModel: string;
  aiReviewContext: string;
  aiMaxDiffLines: number;
}

async function runAiReview(params: AiReviewParams): Promise<void> {
  const {
    provider, repository, prNumber, prTitle, prDescription,
    aiApiKey, aiModel, aiReviewContext, aiMaxDiffLines,
  } = params;

  console.log(`Fetching diff for PR #${prNumber}...`);
  const diff = await provider.getDiff({ repository, prNumber });

  if (!diff.trim()) {
    console.log('##[warning]No diff found for this PR. Skipping AI review.');
    return;
  }

  console.log(`Running AI review with model: ${aiModel}`);
  const result = await reviewPullRequest(aiApiKey, {
    diff,
    prTitle,
    prDescription,
    additionalContext: aiReviewContext,
    model: aiModel,
    maxDiffLines: aiMaxDiffLines,
  });

  const formattedComment = formatAiComment(result.fullComment);

  console.log(`Posting AI review comment: ${result.summary}`);
  await provider.postComment({ repository, prNumber, body: formattedComment });

  console.log('AI review comment posted successfully.');
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
