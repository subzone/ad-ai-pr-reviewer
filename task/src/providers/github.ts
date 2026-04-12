import { Octokit } from '@octokit/rest';
import {
  Provider,
  ProviderConfig,
  PullRequest,
  CreatePROptions,
  PostCommentOptions,
  GetDiffOptions,
  PostReviewCommentsOptions,
  ReviewComment,
} from './base';

export class GitHubProvider implements Provider {
  private client: Octokit;

  constructor(config: ProviderConfig) {
    this.client = new Octokit({
      auth: config.accessToken,
      baseUrl: config.serverUrl ? `${config.serverUrl}/api/v3` : undefined,
    });
  }

  private parseRepo(repository: string): { owner: string; repo: string } {
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository format "${repository}". Expected "owner/repo".`);
    }
    return { owner, repo };
  }

  async createPR(options: CreatePROptions): Promise<PullRequest> {
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

  async findExistingPR(
    repository: string,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<PullRequest | null> {
    const { owner, repo } = this.parseRepo(repository);

    const { data } = await this.client.pulls.list({
      owner,
      repo,
      state: 'open',
      head: `${owner}:${sourceBranch}`,
      base: targetBranch,
    });

    if (data.length === 0) return null;

    const pr = data[0];
    return {
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
    };
  }

  async postComment(options: PostCommentOptions): Promise<void> {
    const { owner, repo } = this.parseRepo(options.repository);

    await this.client.issues.createComment({
      owner,
      repo,
      issue_number: options.prNumber,
      body: options.body,
    });
  }

  async getDiff(options: GetDiffOptions): Promise<string> {
    const { owner, repo } = this.parseRepo(options.repository);

    const { data } = await this.client.pulls.get({
      owner,
      repo,
      pull_number: options.prNumber,
      mediaType: { format: 'diff' },
    });

    return data as unknown as string;
  }

  async postReviewComments(options: PostReviewCommentsOptions): Promise<void> {
    const { owner, repo } = this.parseRepo(options.repository);

    if (options.comments.length === 0) {
      return;
    }

    // Format comments with GitHub suggestion blocks
    const formattedComments = options.comments.map((comment) => {
      let body = `🤖 **AI Review** · ${comment.body}`;
      
      // If there's a suggestion, format it as a GitHub suggestion block
      if (comment.suggestion) {
        body += '\n\n```suggestion\n' + comment.suggestion + '\n```';
      }
      
      return {
        path: comment.path,
        line: comment.line,
        body,
      };
    });

    // Get the latest commit SHA for the PR
    const { data: pr } = await this.client.pulls.get({
      owner,
      repo,
      pull_number: options.prNumber,
    });

    // Post as a review with inline comments
    await this.client.pulls.createReview({
      owner,
      repo,
      pull_number: options.prNumber,
      commit_id: options.commitId || pr.head.sha,
      event: 'COMMENT',
      comments: formattedComments,
    });
  }
}
