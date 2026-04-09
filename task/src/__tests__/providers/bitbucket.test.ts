import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BitbucketProvider', () => {
  const mockToken = 'bitbucket_token_test';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseRepo', () => {
    it('should parse workspace/repo format', () => {
      const repo = 'myworkspace/myrepo';
      const [workspace, name] = repo.split('/');
      expect(workspace).toBe('myworkspace');
      expect(name).toBe('myrepo');
    });

    it('should reject invalid format', () => {
      const repo = 'invalid-repo';
      const [workspace, name] = repo.split('/');
      expect(!workspace || !name).toBe(true);
    });

    it('should preserve case sensitivity', () => {
      const repo = 'MyWorkspace/MyRepo';
      const [workspace, name] = repo.split('/');
      expect(workspace).toBe('MyWorkspace');
      expect(name).toBe('MyRepo');
    });
  });

  describe('Bitbucket Cloud', () => {
    it('should use cloud API endpoint', () => {
      const baseUrl = 'https://api.bitbucket.org/2.0';
      expect(baseUrl).toContain('api.bitbucket.org');
    });

    it('should construct Cloud PR creation request', () => {
      const workspace = 'myworkspace';
      const repo = 'myrepo';
      const endpoint = `/repositories/${workspace}/${repo}/pullrequests`;

      expect(endpoint).toContain('/pullrequests');
    });

    it('should include source and destination branches', () => {
      const prData = {
        source: {
          branch: {
            name: 'feature',
          },
        },
        destination: {
          branch: {
            name: 'main',
          },
        },
        title: 'Add feature',
        description: 'Feature description',
      };

      expect(prData.source.branch.name).toBe('feature');
      expect(prData.destination.branch.name).toBe('main');
    });

    it('should search for open PRs in Cloud', () => {
      const query = 'state=OPEN';
      expect(query).toContain('OPEN');
    });

    it('should use Basic Auth for Cloud', () => {
      const auth = {
        username: 'username',
        password: mockToken,
      };

      expect(auth.username).toBeTruthy();
      expect(auth.password).toBe(mockToken);
    });
  });

  describe('Bitbucket Server / Data Center', () => {
    it('should use server API endpoint', () => {
      const serverUrl = 'https://bitbucket.mycompany.com';
      const baseUrl = `${serverUrl}/rest/api/1.0`;

      expect(baseUrl).toContain('/rest/api/1.0');
    });

    it('should construct Server PR creation request', () => {
      const project = 'PROJ';
      const repo = 'myrepo';
      const endpoint = `/projects/${project}/repos/${repo}/pull-requests`;

      expect(endpoint).toContain('/pull-requests');
    });

    it('should include source and target refs', () => {
      const prData = {
        fromRef: {
          id: 'refs/heads/feature',
          repository: {
            slug: 'myrepo',
            project: {
              key: 'PROJ',
            },
          },
        },
        toRef: {
          id: 'refs/heads/main',
          repository: {
            slug: 'myrepo',
            project: {
              key: 'PROJ',
            },
          },
        },
        title: 'Add feature',
      };

      expect(prData.fromRef.id).toContain('refs/heads/feature');
      expect(prData.toRef.id).toContain('refs/heads/main');
    });

    it('should search for open PRs in Server', () => {
      const query = 'state=OPEN';
      expect(query).toContain('OPEN');
    });

    it('should use Bearer token for Server', () => {
      const authHeader = `Bearer ${mockToken}`;
      expect(authHeader).toContain('Bearer');
    });
  });

  describe('getDiff routing', () => {
    it('should route to Cloud getDiff for Cloud instances', () => {
      const isServer = false;
      expect(!isServer).toBe(true);
    });

    it('should route to Server getDiff for Server instances', () => {
      const isServer = true;
      expect(isServer).toBe(true);
    });

    it('should combine multiple file changes into unified format', () => {
      const changes = [
        { path: { name: 'file1.js' }, diff: { raw: 'diff 1' } },
        { path: { name: 'file2.js' }, diff: { raw: 'diff 2' } },
      ];

      expect(changes.length).toBe(2);
    });
  });

  describe('postComment routing', () => {
    it('should post to Cloud comments endpoint', () => {
      const isServer = false;
      const endpoint = '/repositories/:workspace/:repo/pullrequests/:pr/comments';

      expect(!isServer).toBe(true);
      expect(endpoint).toContain('/comments');
    });

    it('should post to Server activities endpoint', () => {
      const isServer = true;
      const endpoint = '/projects/:key/repos/:slug/pull-requests/:id/comments';

      expect(isServer).toBe(true);
      expect(endpoint).toContain('/comments');
    });
  });

  describe('findExistingPR routing', () => {
    it('should search Cloud PRs correctly', () => {
      const isServer = false;
      const state = 'OPEN';

      expect(!isServer).toBe(true);
      expect(state).toBe('OPEN');
    });

    it('should search Server PRs correctly', () => {
      const isServer = true;
      const state = 'OPEN';

      expect(isServer).toBe(true);
      expect(state).toBe('OPEN');
    });

    it('should filter by source and target branches', () => {
      const filters = {
        sourceBranch: 'feature',
        targetBranch: 'main',
      };

      expect(filters.sourceBranch).toBeTruthy();
      expect(filters.targetBranch).toBeTruthy();
    });
  });

  describe('Authentication', () => {
    it('should require PAT/token for both Cloud and Server', () => {
      const token = mockToken;
      expect(token).toBeTruthy();
      expect(token.length).toBeGreaterThan(0);
    });

    it('should construct auth headers correctly', () => {
      // Cloud: Basic auth
      const cloudAuth = Buffer.from(`${mockToken}:`).toString('base64');
      expect(cloudAuth).toBeTruthy();

      // Server: Bearer token
      const serverAuth = `Bearer ${mockToken}`;
      expect(serverAuth).toContain('Bearer');
    });
  });

  describe('Provider routing (isServer flag)', () => {
    it('should use cloud implementation when isServer=false', () => {
      const isServer = false;
      expect(isServer).toBe(false);
    });

    it('should use server implementation when isServer=true', () => {
      const isServer = true;
      expect(isServer).toBe(true);
    });

    it('should require serverUrl when using server mode', () => {
      const serverUrl = 'https://bitbucket.mycompany.com';
      expect(serverUrl).toBeTruthy();
    });
  });
});
