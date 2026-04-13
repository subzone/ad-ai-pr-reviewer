"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const tl = __importStar(require("azure-pipelines-task-lib/task"));
const base_1 = require("./providers/base");
const github_1 = require("./providers/github");
const gitlab_1 = require("./providers/gitlab");
const bitbucket_1 = require("./providers/bitbucket");
const reviewer_1 = require("./ai/reviewer");
async function run() {
    try {
        // ── Inputs ───────────────────────────────────────────────────────────────
        const action = tl.getInput('action', true);
        const provider = tl.getInput('provider', true);
        const accessToken = tl.getInput('accessToken', true);
        const repository = tl.getInput('repository', true);
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
        const aiReviewMode = (tl.getInput('aiReviewMode', false) ?? 'standard');
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
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        tl.setResult(tl.TaskResult.Failed, message);
    }
}
async function handleCreatePR(params) {
    const { provider, repository, sourceBranch, targetBranch, prTitle, prDescription, failOnExistingPR, enableAiReview, aiProviderConfig, aiModel, aiReviewContext, aiMaxDiffLines, aiReviewMode, aiMaxFiles, aiEnableReasoning, aiEnableTools, aiEnableSkills, aiSkills, aiSkillAutoDetect, aiEnableInlineComments, repositoryPath, } = params;
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
async function handleReviewPR(params) {
    const { prNumber, aiProviderConfig } = params;
    if (!aiProviderConfig) {
        tl.setResult(tl.TaskResult.Failed, 'AI provider configuration is required for the reviewPR action.');
        return;
    }
    await runAiReview(params);
    tl.setResult(tl.TaskResult.Succeeded, `AI review posted on PR #${prNumber}`);
}
async function handleCommentPR(params) {
    const { provider, repository, prNumber, commentBody } = params;
    if (!commentBody.trim()) {
        tl.setResult(tl.TaskResult.Failed, 'Comment text cannot be empty.');
        return;
    }
    const formatted = (0, base_1.formatManualComment)(commentBody);
    console.log(`Posting comment on PR #${prNumber}`);
    await provider.postComment({ repository, prNumber, body: formatted });
    tl.setResult(tl.TaskResult.Succeeded, `Comment posted on PR #${prNumber}`);
}
async function runAiReview(params) {
    const { provider, repository, prNumber, prTitle, prDescription, aiProviderConfig, aiModel, aiReviewContext, aiMaxDiffLines, aiReviewMode, aiMaxFiles, aiEnableReasoning, aiEnableTools, aiEnableSkills, aiSkills, aiSkillAutoDetect, aiEnableInlineComments, repositoryPath, } = params;
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
    const result = await (0, reviewer_1.reviewPullRequest)(aiProviderConfig, {
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
    }
    else {
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
    const formattedComment = (0, base_1.formatAiComment)(result.fullComment);
    console.log(`Posting AI review comment: ${result.summary}`);
    await provider.postComment({ repository, prNumber, body: formattedComment });
    // Post inline comments if enabled and provider supports it
    if (aiEnableInlineComments && result.structuredFindings && result.structuredFindings.length > 0) {
        if (provider.postReviewComments) {
            console.log(`Converting ${result.structuredFindings.length} findings to inline comments...`);
            const comments = (0, reviewer_1.convertFindingsToComments)(result.structuredFindings, diff);
            if (comments.length > 0) {
                console.log(`Posting ${comments.length} inline code comments...`);
                await provider.postReviewComments({
                    repository,
                    prNumber,
                    comments,
                    // Get commit SHA from the latest diff (some providers need it)
                    commitId: undefined, // Providers will fetch if needed
                });
                console.log(`✅ Posted ${comments.length} inline comments with code suggestions`);
            }
            else {
                console.log('⚠️  No inline comments could be created (line numbers not found in diff)');
            }
        }
        else {
            console.log('⚠️  Provider does not support inline comments, skipping');
        }
    }
    else if (aiEnableInlineComments && (!result.structuredFindings || result.structuredFindings.length === 0)) {
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
function buildAiProviderConfig() {
    const aiProvider = (tl.getInput('aiProvider', false) ?? 'anthropic');
    switch (aiProvider) {
        case 'anthropic': {
            const apiKey = tl.getInput('aiApiKey', false) ?? '';
            if (!apiKey)
                throw new Error('aiApiKey is required when using Anthropic as AI provider.');
            return { provider: 'anthropic', apiKey };
        }
        case 'azure': {
            const apiKey = tl.getInput('aiApiKey', false) ?? '';
            const baseUrl = tl.getInput('aiBaseUrl', false) ?? '';
            if (!apiKey)
                throw new Error('aiApiKey is required when using Azure (Azure OpenAI or Azure AI Foundry).');
            if (!baseUrl)
                throw new Error('aiBaseUrl is required when using Azure. For Azure OpenAI use your resource endpoint (e.g. https://<resource>.openai.azure.com). For Azure AI Foundry use the models endpoint (e.g. https://<resource>.services.ai.azure.com/models).');
            return { provider: 'azure', apiKey, baseUrl };
        }
        case 'litellm': {
            const apiKey = tl.getInput('aiApiKey', false) ?? '';
            const baseUrl = tl.getInput('aiBaseUrl', false) ?? '';
            if (!baseUrl)
                throw new Error('aiBaseUrl is required when using LiteLLM (your proxy URL).');
            return { provider: 'litellm', apiKey, baseUrl };
        }
        case 'bedrock': {
            const region = tl.getInput('awsRegion', false) ?? '';
            if (!region)
                throw new Error('awsRegion is required when using AWS Bedrock.');
            return {
                provider: 'bedrock',
                accessKeyId: tl.getInput('awsAccessKeyId', false) ?? undefined,
                secretAccessKey: tl.getInput('awsSecretAccessKey', false) ?? undefined,
                region,
            };
        }
        case 'vertex': {
            const projectId = tl.getInput('gcpProjectId', false) ?? '';
            const region = tl.getInput('gcpRegion', false) ?? '';
            if (!projectId)
                throw new Error('gcpProjectId is required when using Google Vertex AI.');
            if (!region)
                throw new Error('gcpRegion is required when using Google Vertex AI (e.g. us-east5).');
            return { provider: 'vertex', projectId, region };
        }
        default:
            throw new Error(`Unknown AI provider: ${aiProvider}`);
    }
}
// ── Utilities ─────────────────────────────────────────────────────────────────
function buildProvider(provider, accessToken, serverUrl) {
    const config = { accessToken, serverUrl: serverUrl ?? undefined };
    switch (provider) {
        case 'github':
            return new github_1.GitHubProvider(config);
        case 'gitlab':
            return new gitlab_1.GitLabProvider(config);
        case 'bitbucket':
            return new bitbucket_1.BitbucketProvider(config, false);
        case 'bitbucket-server':
            if (!config.serverUrl) {
                throw new Error('Server URL is required for Bitbucket Server.');
            }
            return new bitbucket_1.BitbucketProvider(config, true);
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}
function requirePrNumber(raw) {
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
