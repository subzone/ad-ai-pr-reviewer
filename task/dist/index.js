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
        const aiApiKey = tl.getInput('aiApiKey', false) ?? '';
        const aiModel = tl.getInput('aiModel', false) ?? 'claude-sonnet-4-6';
        const aiReviewContext = tl.getInput('aiReviewContext', false) ?? '';
        const aiMaxDiffLines = parseInt(tl.getInput('aiMaxDiffLines', false) ?? '500', 10);
        const aiReviewMode = (tl.getInput('aiReviewMode', false) ?? 'standard');
        const aiMaxFiles = parseInt(tl.getInput('aiMaxFiles', false) ?? '10', 10);
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
                    aiReviewMode,
                    aiMaxFiles,
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
                    aiReviewMode,
                    aiMaxFiles,
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
    const { provider, repository, sourceBranch, targetBranch, prTitle, prDescription, failOnExistingPR, enableAiReview, aiApiKey, aiModel, aiReviewContext, aiMaxDiffLines, aiReviewMode, aiMaxFiles, } = params;
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
                aiApiKey, aiModel, aiReviewContext, aiMaxDiffLines, aiReviewMode, aiMaxFiles,
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
            aiApiKey, aiModel, aiReviewContext, aiMaxDiffLines, aiReviewMode, aiMaxFiles,
        });
    }
    tl.setResult(tl.TaskResult.Succeeded, `PR created: ${pr.url}`);
}
async function handleReviewPR(params) {
    const { provider, repository, prNumber, aiApiKey } = params;
    if (!aiApiKey) {
        tl.setResult(tl.TaskResult.Failed, 'AI API Key is required for the reviewPR action.');
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
    const { provider, repository, prNumber, prTitle, prDescription, aiApiKey, aiModel, aiReviewContext, aiMaxDiffLines, aiReviewMode, aiMaxFiles, } = params;
    console.log(`Fetching diff for PR #${prNumber}...`);
    const diff = await provider.getDiff({ repository, prNumber });
    if (!diff.trim()) {
        console.log('##[warning]No diff found for this PR. Skipping AI review.');
        return;
    }
    console.log(`Running AI review — mode: ${aiReviewMode}, model: ${aiModel}`);
    const result = await (0, reviewer_1.reviewPullRequest)(aiApiKey, {
        diff,
        prTitle,
        prDescription,
        additionalContext: aiReviewContext,
        model: aiModel,
        maxDiffLines: aiMaxDiffLines,
        reviewMode: aiReviewMode,
        maxFiles: aiMaxFiles,
    });
    const formattedComment = (0, base_1.formatAiComment)(result.fullComment);
    console.log(`Posting AI review comment: ${result.summary}`);
    await provider.postComment({ repository, prNumber, body: formattedComment });
    // Expose review metrics as pipeline variables for downstream steps/summary
    tl.setVariable('ReviewSummary', result.summary);
    tl.setVariable('ReviewVerdict', result.verdict);
    tl.setVariable('ReviewTotalIssues', String(result.totalIssues));
    for (const cat of result.categories) {
        const key = `Review_${cat.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        tl.setVariable(key, String(cat.count));
    }
    console.log(`AI review complete — verdict: ${result.verdict}, issues: ${result.totalIssues}`);
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
