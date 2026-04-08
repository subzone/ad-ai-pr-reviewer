"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitLabProvider = void 0;
const axios_1 = __importDefault(require("axios"));
class GitLabProvider {
    constructor(config) {
        this.baseUrl = (config.serverUrl ?? 'https://gitlab.com').replace(/\/$/, '');
        this.client = axios_1.default.create({
            baseURL: `${this.baseUrl}/api/v4`,
            headers: {
                'PRIVATE-TOKEN': config.accessToken,
                'Content-Type': 'application/json',
            },
        });
    }
    // GitLab uses URL-encoded "namespace/project" as the project ID
    encodeProject(repository) {
        return encodeURIComponent(repository);
    }
    async createPR(options) {
        const projectId = this.encodeProject(options.repository);
        const { data } = await this.client.post(`/projects/${projectId}/merge_requests`, {
            title: options.title,
            description: options.description,
            source_branch: options.sourceBranch,
            target_branch: options.targetBranch,
        });
        return {
            number: data.iid,
            url: data.web_url,
            title: data.title,
            sourceBranch: data.source_branch,
            targetBranch: data.target_branch,
        };
    }
    async findExistingPR(repository, sourceBranch, targetBranch) {
        const projectId = this.encodeProject(repository);
        const { data } = await this.client.get(`/projects/${projectId}/merge_requests`, {
            params: {
                state: 'opened',
                source_branch: sourceBranch,
                target_branch: targetBranch,
            },
        });
        if (!data || data.length === 0)
            return null;
        const mr = data[0];
        return {
            number: mr.iid,
            url: mr.web_url,
            title: mr.title,
            sourceBranch: mr.source_branch,
            targetBranch: mr.target_branch,
        };
    }
    async postComment(options) {
        const projectId = this.encodeProject(options.repository);
        await this.client.post(`/projects/${projectId}/merge_requests/${options.prNumber}/notes`, { body: options.body });
    }
    async getDiff(options) {
        const projectId = this.encodeProject(options.repository);
        const { data } = await this.client.get(`/projects/${projectId}/merge_requests/${options.prNumber}/diffs`);
        // Combine all file diffs into a unified diff string
        return data
            .map((file) => `--- a/${file.old_path}\n+++ b/${file.new_path}\n${file.diff}`)
            .join('\n\n');
    }
}
exports.GitLabProvider = GitLabProvider;
