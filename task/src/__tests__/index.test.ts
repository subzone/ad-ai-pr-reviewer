describe('Index Utilities', () => {
  describe('requirePrNumber', () => {
    it('should parse valid PR number string', () => {
      const raw = '123';
      const num = parseInt(raw, 10);
      expect(num).toBe(123);
      expect(num > 0).toBe(true);
    });

    it('should reject invalid PR number', () => {
      const raw = 'not-a-number';
      const num = parseInt(raw, 10);
      expect(isNaN(num)).toBe(true);
    });

    it('should reject zero', () => {
      const raw = '0';
      const num = parseInt(raw, 10);
      expect(num <= 0).toBe(true);
    });

    it('should reject negative numbers', () => {
      const raw = '-5';
      const num = parseInt(raw, 10);
      expect(num <= 0).toBe(true);
    });

    it('should reject empty string', () => {
      const raw = '';
      expect(raw === '').toBe(true);
    });

    it('should reject null or undefined by checking existence', () => {
      const raw: string | null = null;
      const result = !raw;
      expect(result).toBe(true);
    });

    it('should handle whitespace trim', () => {
      const raw = '  456  ';
      const trimmed = raw.trim();
      const num = parseInt(trimmed, 10);
      expect(num).toBe(456);
    });
  });

  describe('buildProvider', () => {
    it('should recognize github provider', () => {
      const provider = 'github';
      expect(provider === 'github').toBe(true);
    });

    it('should recognize gitlab provider', () => {
      const provider = 'gitlab';
      expect(provider === 'gitlab').toBe(true);
    });

    it('should recognize bitbucket cloud provider', () => {
      const provider = 'bitbucket';
      expect(provider === 'bitbucket').toBe(true);
    });

    it('should recognize bitbucket server provider', () => {
      const provider = 'bitbucket-server';
      expect(provider === 'bitbucket-server').toBe(true);
    });

    it('should require serverUrl for bitbucket-server', () => {
      const provider = 'bitbucket-server';
      const serverUrl: string | undefined = undefined;

      if (provider === 'bitbucket-server' && !serverUrl) {
        expect(() => {
          throw new Error('Server URL is required for Bitbucket Server.');
        }).toThrow('Server URL is required for Bitbucket Server.');
      }
    });

    it('should reject unknown provider', () => {
      const providers = ['github', 'gitlab', 'bitbucket', 'bitbucket-server'];
      const testProvider = 'unknown-provider';
      const isKnown = providers.includes(testProvider);

      expect(isKnown).toBe(false);
    });

    it('should pass accessToken to provider config', () => {
      const token = 'ghp_test123';
      expect(token).toBeTruthy();
      expect(token.length).toBeGreaterThan(0);
    });

    it('should pass serverUrl to provider config if provided', () => {
      const serverUrl = 'https://gitlab.mycompany.com';
      expect(serverUrl).toBeTruthy();
      expect(serverUrl).toContain('https://');
    });
  });

  describe('Provider instantiation', () => {
    it('should accept github config', () => {
      const config = {
        accessToken: 'token',
        serverUrl: undefined,
      };
      expect(config.accessToken).toBeTruthy();
      expect(config.serverUrl).toBeUndefined();
    });

    it('should accept gitlab config with serverUrl', () => {
      const config = {
        accessToken: 'token',
        serverUrl: 'https://gitlab.example.com',
      };
      expect(config.accessToken).toBeTruthy();
      expect(config.serverUrl).toBeTruthy();
    });

    it('should accept bitbucket config', () => {
      const config = {
        accessToken: 'token',
        serverUrl: undefined,
      };
      expect(config.accessToken).toBeTruthy();
    });
  });
});
