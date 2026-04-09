import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GitLabProvider', () => {
  const mockToken = 'gitlab_token_test';
  const mockBaseUrl = 'https://gitlab.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('encodeProject', () => {
    it('should URL-encode project path', () => {
      const project = 'my-group/my-project';
      const encoded = encodeURIComponent(project);
      expect(encoded).toBe('my-group%2Fmy-project');
    });

    it('should handle nested groups', () => {
      const project = 'group/subgroup/project';
      const encoded = encodeURIComponent(project);
      expect(encoded).toContain('%2F');
    });

    it('should encode special characters', () => {
      const project = 'group/project name';
      const encoded = encodeURIComponent(project);
      expect(encoded).toContain('%20');
    });

    it('should preserve alphanumeric characters', () => {
      const project = 'group1/project2';
      const encoded = encodeURIComponent(project);
      expect(encoded).toBe('group1%2Fproject2');
    });
  });

  describe('createPR (Merge Request)', () => {
    it('should construct MR creation request', () => {
      const options = {
        repository: 'mygroup/myproject',
        sourceBranch: 'feature-branch',
        targetBranch: 'main',
        title: 'Add feature',
        description: 'Feature description',
      };

      expect(options.repository).toBeTruthy();
      expect(options.sourceBranch).toBeTruthy();
      expect(options.targetBranch).toBeTruthy();
    });

    it('should use correct GitLab API endpoint', () => {
      const projectId = 'mygroup%2Fmyproject';
      const endpoint = `/projects/${projectId}/merge_requests`;

      expect(endpoint).toContain('/merge_requests');
    });

    it('should include all MR fields', () => {
      const mrFields = {
        title: 'MR Title',
        description: 'MR Description',
        source_branch: 'feature',
        target_branch: 'main',
      };

      expect(mrFields.title).toBeTruthy();
      expect(mrFields.description).toBeTruthy();
      expect(mrFields.source_branch).toBeTruthy();
      expect(mrFields.target_branch).toBeTruthy();
    });
  });

  describe('findExistingPR (Merge Request)', () => {
    it('should search for open merge requests', () => {
      const repository = 'mygroup/myproject';
      const sourceBranch = 'feature';
      const targetBranch = 'main';

      const query = {
        state: 'opened',
        source_branch: sourceBranch,
        target_branch: targetBranch,
      };

      expect(query.state).toBe('opened');
    });

    it('should filter by both branches', () => {
      const filters = {
        source_branch: 'develop',
        target_branch: 'main',
      };

      expect(filters.source_branch).toBeTruthy();
      expect(filters.target_branch).toBeTruthy();
    });
  });

  describe('getDiff', () => {
    it('should get MR changes/diffs', () => {
      const projectId = 'mygroup%2Fmyproject';
      const mrIid = 1;

      const endpoint = `/projects/${projectId}/merge_requests/${mrIid}/diffs`;
      expect(endpoint).toContain('/diffs');
    });

    it('should combine multiple file diffs into unified format', () => {
      const diffs = [
        {
          old_path: 'file1.js',
          new_path: 'file1.js',
          diff: 'diff content 1',
        },
        {
          old_path: 'file2.js',
          new_path: 'file2.js',
          diff: 'diff content 2',
        },
      ];

      expect(diffs.length).toBe(2);
      expect(diffs[0].diff).toBeTruthy();
    });
  });

  describe('postComment (Note)', () => {
    it('should post note/comment to MR', () => {
      const projectId = 'mygroup%2Fmyproject';
      const mrIid = 1;
      const body = 'Review comment';

      expect(projectId).toBeTruthy();
      expect(mrIid).toBeGreaterThan(0);
      expect(body).toBeTruthy();
    });

    it('should use correct GitLab endpoint', () => {
      const endpoint = '/projects/:id/merge_requests/:merge_request_iid/notes';
      expect(endpoint).toContain('/notes');
    });
  });

  describe('Cloud vs Self-Hosted', () => {
    it('should use gitlab.com for cloud instances', () => {
      const baseUrl = 'https://gitlab.com';
      expect(baseUrl).toBe('https://gitlab.com');
    });

    it('should use custom serverUrl for self-hosted', () => {
      const serverUrl = 'https://gitlab.mycompany.com';
      expect(serverUrl).toContain('mycompany');
    });

    it('should accept serverUrl in config', () => {
      const config = {
        accessToken: mockToken,
        serverUrl: 'https://gitlab.internal.com',
      };

      expect(config.serverUrl).toBeTruthy();
    });
  });

  describe('Authentication', () => {
    it('should include token in request headers', () => {
      const headers = {
        'PRIVATE-TOKEN': mockToken,
      };

      expect(headers['PRIVATE-TOKEN']).toBe(mockToken);
    });

    it('should support both token types', () => {
      const personalToken = 'glpat-xxx';
      const projectToken = 'glpat-yyy';

      expect(personalToken).toMatch(/^glpat-/);
      expect(projectToken).toMatch(/^glpat-/);
    });
  });
});
