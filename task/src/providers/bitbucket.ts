import axios, { AxiosInstance } from 'axios';
import {
  Provider,
  ProviderConfig,
  PullRequest,
  CreatePROptions,
  PostCommentOptions,
  PostReviewCommentsOptions,
  ReviewComment,
  GetDiffOptions,
} from './base';

export class BitbucketProvider implements Provider {
  private client: AxiosInstance;
  private isServer: boolean;

  constructor(config: ProviderConfig, isServer = false) {
    this.isServer = isServer;

    const baseURL = isServer
      ? `${(config.serverUrl ?? '').replace(/\/$/, '')}/rest/api/1.0`
      : 'https://api.bitbucket.org/2.0';

    this.client = axios.create({
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

  private parseRepo(repository: string): { workspace: string; slug: string } {
    const [workspace, slug] = repository.split('/');
    if (!workspace || !slug) {
      throw new Error(`Invalid repository format "${repository}". Expected "workspace/repo".`);
    }
    return { workspace, slug };
  }

  // ── Bitbucket Cloud ─────────────────────────────────────────────────────────

  private async createCloudPR(options: CreatePROptions): Promise<PullRequest> {
    const { workspace, slug } = this.parseRepo(options.repository);

    const { data } = await this.client.post(
      `/repositories/${workspace}/${slug}/pullrequests`,
      {
        title: options.title,
        description: options.description,
        source: { branch: { name: options.sourceBranch } },
        destination: { branch: { name: options.targetBranch } },
      },
    );

    return {
      number: data.id,
      url: data.links.html.href,
      title: data.title,
      sourceBranch: data.source.branch.name,
      targetBranch: data.destination.branch.name,
    };
  }

  private async findExistingCloudPR(
    repository: string,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<PullRequest | null> {
    const { workspace, slug } = this.parseRepo(repository);

    const { data } = await this.client.get(
      `/repositories/${workspace}/${slug}/pullrequests`,
      {
        params: {
          state: 'OPEN',
          q: `source.branch.name="${sourceBranch}" AND destination.branch.name="${targetBranch}"`,
        },
      },
    );

    if (!data.values || data.values.length === 0) return null;

    const pr = data.values[0];
    return {
      number: pr.id,
      url: pr.links.html.href,
      title: pr.title,
      sourceBranch: pr.source.branch.name,
      targetBranch: pr.destination.branch.name,
    };
  }

  private async postCloudComment(options: PostCommentOptions): Promise<void> {
    const { workspace, slug } = this.parseRepo(options.repository);

    await this.client.post(
      `/repositories/${workspace}/${slug}/pullrequests/${options.prNumber}/comments`,
      { content: { raw: options.body } },
    );
  }

  private async postCloudReviewComments(
    options: PostReviewCommentsOptions,
  ): Promise<void> {
    const { workspace, slug } = this.parseRepo(options.repository);

    // Bitbucket Cloud uses inline comments with line anchors
    for (const comment of options.comments) {
      const body = comment.suggestion
        ? `🤖 **AI Review**\n\n${comment.body}\n\n**Suggested fix:**\n\`\`\`\n${comment.suggestion}\n\`\`\``
        : `🤖 **AI Review**\n\n${comment.body}`;

      await this.client.post(
        `/repositories/${workspace}/${slug}/pullrequests/${options.prNumber}/comments`,
        {
          content: { raw: body },
          inline: {
            path: comment.path,
            to: comment.line,
          },
        },
      );
    }
  }

  private async getCloudDiff(options: GetDiffOptions): Promise<string> {
    const { workspace, slug } = this.parseRepo(options.repository);

    const { data } = await this.client.get(
      `/repositories/${workspace}/${slug}/pullrequests/${options.prNumber}/diff`,
      { responseType: 'text' },
    );

    return data as string;
  }

  // ── Bitbucket Server (Data Center) ──────────────────────────────────────────

  private async createServerPR(options: CreatePROptions): Promise<PullRequest> {
    const { workspace, slug } = this.parseRepo(options.repository);

    const { data } = await this.client.post(
      `/projects/${workspace}/repos/${slug}/pull-requests`,
      {
        title: options.title,
        description: options.description,
        fromRef: { id: `refs/heads/${options.sourceBranch}` },
        toRef: { id: `refs/heads/${options.targetBranch}` },
      },
    );

    return {
      number: data.id,
      url: data.links.self[0].href,
      title: data.title,
      sourceBranch: options.sourceBranch,
      targetBranch: options.targetBranch,
    };
  }

  private async findExistingServerPR(
    repository: string,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<PullRequest | null> {
    const { workspace, slug } = this.parseRepo(repository);

    const { data } = await this.client.get(
      `/projects/${workspace}/repos/${slug}/pull-requests`,
      {
        params: {
          state: 'OPEN',
          at: `refs/heads/${sourceBranch}`,
        },
      },
    );

    const pr = (data.values ?? []).find(
      (p: { toRef: { displayId: string } }) => p.toRef.displayId === targetBranch,
    );

    if (!pr) return null;

    return {
      number: pr.id,
      url: pr.links.self[0].href,
      title: pr.title,
      sourceBranch,
      targetBranch,
    };
  }

  private async postServerComment(options: PostCommentOptions): Promise<void> {
    const { workspace, slug } = this.parseRepo(options.repository);

    await this.client.post(
      `/projects/${workspace}/repos/${slug}/pull-requests/${options.prNumber}/comments`,
      { text: options.body },
    );
  }

  private async postServerReviewComments(
    options: PostReviewCommentsOptions,
  ): Promise<void> {
    const { workspace, slug } = this.parseRepo(options.repository);

    // Bitbucket Server uses inline comments with anchor
    for (const comment of options.comments) {
      const body = comment.suggestion
        ? `🤖 **AI Review**\n\n${comment.body}\n\n**Suggested fix:**\n\`\`\`\n${comment.suggestion}\n\`\`\``
        : `🤖 **AI Review**\n\n${comment.body}`;

      await this.client.post(
        `/projects/${workspace}/repos/${slug}/pull-requests/${options.prNumber}/comments`,
        {
          text: body,
          anchor: {
            path: comment.path,
            line: comment.line,
            lineType: 'ADDED',
          },
        },
      );
    }
  }

  private async getServerDiff(options: GetDiffOptions): Promise<string> {
    const { workspace, slug } = this.parseRepo(options.repository);

    const { data } = await this.client.get(
      `/projects/${workspace}/repos/${slug}/pull-requests/${options.prNumber}/diff`,
      { responseType: 'text' },
    );

    return data as string;
  }

  // ── Unified interface ────────────────────────────────────────────────────────

  async createPR(options: CreatePROptions): Promise<PullRequest> {
    return this.isServer ? this.createServerPR(options) : this.createCloudPR(options);
  }

  async findExistingPR(
    repository: string,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<PullRequest | null> {
    return this.isServer
      ? this.findExistingServerPR(repository, sourceBranch, targetBranch)
      : this.findExistingCloudPR(repository, sourceBranch, targetBranch);
  }

  async postComment(options: PostCommentOptions): Promise<void> {
    return this.isServer
      ? this.postServerComment(options)
      : this.postCloudComment(options);
  }

  async postReviewComments(options: PostReviewCommentsOptions): Promise<void> {
    return this.isServer
      ? this.postServerReviewComments(options)
      : this.postCloudReviewComments(options);
  }

  async getDiff(options: GetDiffOptions): Promise<string> {
    return this.isServer ? this.getServerDiff(options) : this.getCloudDiff(options);
  }
}
