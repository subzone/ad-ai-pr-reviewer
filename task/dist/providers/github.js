"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubProvider = void 0;
const rest_1 = require("@octokit/rest");
class GitHubProvider {
    constructor(config) {
        this.client = new rest_1.Octokit({
            auth: config.accessToken,
            baseUrl: config.serverUrl ? `${config.serverUrl}/api/v3` : undefined,
        });
    }
    parseRepo(repository) {
        const [owner, repo] = repository.split('/');
        if (!owner || !repo) {
            throw new Error(`Invalid repository format "${repository}". Expected "owner/repo".`);
        }
        return { owner, repo };
    }
    async createPR(options) {
        const { owner, repo } = this.parseRepo(options.repository);
        const { data } = await this.client.pulls.create({
            owner,
            repo,
            title: options.title,
            body: options.description,
            head: options.sourceBranch,
            base: options.targetBranch,
        });
        return {
            number: data.number,
            url: data.html_url,
            title: data.title,
            sourceBranch: data.head.ref,
            targetBranch: data.base.ref,
        };
    }
    async findExistingPR(repository, sourceBranch, targetBranch) {
        const { owner, repo } = this.parseRepo(repository);
        const { data } = await this.client.pulls.list({
            owner,
            repo,
            state: 'open',
            head: `${owner}:${sourceBranch}`,
            base: targetBranch,
        });
        if (data.length === 0)
            return null;
        const pr = data[0];
        return {
            number: pr.number,
            url: pr.html_url,
            title: pr.title,
            sourceBranch: pr.head.ref,
            targetBranch: pr.base.ref,
        };
    }
    async postComment(options) {
        const { owner, repo } = this.parseRepo(options.repository);
        await this.client.issues.createComment({
            owner,
            repo,
            issue_number: options.prNumber,
            body: options.body,
        });
    }
    async getDiff(options) {
        const { owner, repo } = this.parseRepo(options.repository);
        const { data } = await this.client.pulls.get({
            owner,
            repo,
            pull_number: options.prNumber,
            mediaType: { format: 'diff' },
        });
        return data;
    }
}
exports.GitHubProvider = GitHubProvider;
