"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitbucketProvider = void 0;
const axios_1 = __importDefault(require("axios"));
class BitbucketProvider {
    constructor(config, isServer = false) {
        this.isServer = isServer;
        const baseURL = isServer
            ? `${(config.serverUrl ?? '').replace(/\/$/, '')}/rest/api/1.0`
            : 'https://api.bitbucket.org/2.0';
        this.client = axios_1.default.create({
            baseURL,
            headers: {
                // Cloud uses Basic auth (username:app_password → Base64)
                // Server uses Bearer auth (Personal Access Token)
                Authorization: isServer
                    ? `Bearer ${config.accessToken}`
                    : `Basic ${Buffer.from(config.accessToken).toString('base64')}`,
                'Content-Type': 'application/json',
            },
        });
    }
    parseRepo(repository) {
        const [workspace, slug] = repository.split('/');
        if (!workspace || !slug) {
            throw new Error(`Invalid repository format "${repository}". Expected "workspace/repo".`);
        }
        return { workspace, slug };
    }
    // ── Bitbucket Cloud ─────────────────────────────────────────────────────────
    async createCloudPR(options) {
        const { workspace, slug } = this.parseRepo(options.repository);
        const { data } = await this.client.post(`/repositories/${workspace}/${slug}/pullrequests`, {
            title: options.title,
            description: options.description,
            source: { branch: { name: options.sourceBranch } },
            destination: { branch: { name: options.targetBranch } },
        });
        return {
            number: data.id,
            url: data.links.html.href,
            title: data.title,
            sourceBranch: data.source.branch.name,
            targetBranch: data.destination.branch.name,
        };
    }
    async findExistingCloudPR(repository, sourceBranch, targetBranch) {
        const { workspace, slug } = this.parseRepo(repository);
        const { data } = await this.client.get(`/repositories/${workspace}/${slug}/pullrequests`, {
            params: {
                state: 'OPEN',
                q: `source.branch.name="${sourceBranch}" AND destination.branch.name="${targetBranch}"`,
            },
        });
        if (!data.values || data.values.length === 0)
            return null;
        const pr = data.values[0];
        return {
            number: pr.id,
            url: pr.links.html.href,
            title: pr.title,
            sourceBranch: pr.source.branch.name,
            targetBranch: pr.destination.branch.name,
        };
    }
    async postCloudComment(options) {
        const { workspace, slug } = this.parseRepo(options.repository);
        await this.client.post(`/repositories/${workspace}/${slug}/pullrequests/${options.prNumber}/comments`, { content: { raw: options.body } });
    }
    async getCloudDiff(options) {
        const { workspace, slug } = this.parseRepo(options.repository);
        const { data } = await this.client.get(`/repositories/${workspace}/${slug}/pullrequests/${options.prNumber}/diff`, { responseType: 'text' });
        return data;
    }
    // ── Bitbucket Server (Data Center) ──────────────────────────────────────────
    async createServerPR(options) {
        const { workspace, slug } = this.parseRepo(options.repository);
        const { data } = await this.client.post(`/projects/${workspace}/repos/${slug}/pull-requests`, {
            title: options.title,
            description: options.description,
            fromRef: { id: `refs/heads/${options.sourceBranch}` },
            toRef: { id: `refs/heads/${options.targetBranch}` },
        });
        return {
            number: data.id,
            url: data.links.self[0].href,
            title: data.title,
            sourceBranch: options.sourceBranch,
            targetBranch: options.targetBranch,
        };
    }
    async findExistingServerPR(repository, sourceBranch, targetBranch) {
        const { workspace, slug } = this.parseRepo(repository);
        const { data } = await this.client.get(`/projects/${workspace}/repos/${slug}/pull-requests`, {
            params: {
                state: 'OPEN',
                at: `refs/heads/${sourceBranch}`,
            },
        });
        const pr = (data.values ?? []).find((p) => p.toRef.displayId === targetBranch);
        if (!pr)
            return null;
        return {
            number: pr.id,
            url: pr.links.self[0].href,
            title: pr.title,
            sourceBranch,
            targetBranch,
        };
    }
    async postServerComment(options) {
        const { workspace, slug } = this.parseRepo(options.repository);
        await this.client.post(`/projects/${workspace}/repos/${slug}/pull-requests/${options.prNumber}/comments`, { text: options.body });
    }
    async getServerDiff(options) {
        const { workspace, slug } = this.parseRepo(options.repository);
        const { data } = await this.client.get(`/projects/${workspace}/repos/${slug}/pull-requests/${options.prNumber}/diff`, { responseType: 'text' });
        return data;
    }
    // ── Unified interface ────────────────────────────────────────────────────────
    async createPR(options) {
        return this.isServer ? this.createServerPR(options) : this.createCloudPR(options);
    }
    async findExistingPR(repository, sourceBranch, targetBranch) {
        return this.isServer
            ? this.findExistingServerPR(repository, sourceBranch, targetBranch)
            : this.findExistingCloudPR(repository, sourceBranch, targetBranch);
    }
    async postComment(options) {
        return this.isServer
            ? this.postServerComment(options)
            : this.postCloudComment(options);
    }
    async getDiff(options) {
        return this.isServer ? this.getServerDiff(options) : this.getCloudDiff(options);
    }
}
exports.BitbucketProvider = BitbucketProvider;
