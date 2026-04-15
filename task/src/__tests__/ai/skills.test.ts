import { parseSkillResponse, recoverTruncatedFindingsJson, isDiffLinesAllComments, normalizeSeverity, ReviewSkill } from '../../ai/skills';

describe('normalizeSeverity', () => {
  it('accepts valid lowercase severities', () => {
    expect(normalizeSeverity('critical')).toBe('critical');
    expect(normalizeSeverity('high')).toBe('high');
    expect(normalizeSeverity('medium')).toBe('medium');
    expect(normalizeSeverity('low')).toBe('low');
    expect(normalizeSeverity('info')).toBe('info');
  });

  it('normalizes uppercase severities to lowercase', () => {
    expect(normalizeSeverity('CRITICAL')).toBe('critical');
    expect(normalizeSeverity('HIGH')).toBe('high');
    expect(normalizeSeverity('MEDIUM')).toBe('medium');
    expect(normalizeSeverity('LOW')).toBe('low');
    expect(normalizeSeverity('INFO')).toBe('info');
  });

  it('normalizes mixed-case severities to lowercase', () => {
    expect(normalizeSeverity('Critical')).toBe('critical');
    expect(normalizeSeverity('High')).toBe('high');
    expect(normalizeSeverity('Medium')).toBe('medium');
    expect(normalizeSeverity('Low')).toBe('low');
    expect(normalizeSeverity('Info')).toBe('info');
  });

  it('trims whitespace from severities', () => {
    expect(normalizeSeverity(' critical ')).toBe('critical');
    expect(normalizeSeverity('\thigh\t')).toBe('high');
    expect(normalizeSeverity('\n medium \n')).toBe('medium');
    expect(normalizeSeverity('  low  ')).toBe('low');
  });

  it('handles combined whitespace and case normalization', () => {
    expect(normalizeSeverity(' CRITICAL ')).toBe('critical');
    expect(normalizeSeverity('  High  ')).toBe('high');
    expect(normalizeSeverity('\tMEDIUM\t')).toBe('medium');
  });

  it('returns "info" for invalid severities', () => {
    expect(normalizeSeverity('invalid')).toBe('info');
    expect(normalizeSeverity('warning')).toBe('info');
    expect(normalizeSeverity('error')).toBe('info');
    expect(normalizeSeverity('severe')).toBe('info');
    expect(normalizeSeverity('')).toBe('info');
  });

  it('returns "info" for undefined', () => {
    expect(normalizeSeverity(undefined)).toBe('info');
  });

  it('returns "info" for whitespace-only strings', () => {
    expect(normalizeSeverity('   ')).toBe('info');
    expect(normalizeSeverity('\t\n')).toBe('info');
  });
});

describe('recoverTruncatedFindingsJson', () => {
  it('returns null for an empty string', () => {
    expect(recoverTruncatedFindingsJson('')).toBeNull();
  });

  it('returns null when no } is present', () => {
    expect(recoverTruncatedFindingsJson('{"findings": [')).toBeNull();
  });

  it('does not modify already-valid JSON', () => {
    const valid = JSON.stringify({ findings: [{ severity: 'high', title: 'SQL Injection' }] });
    const result = recoverTruncatedFindingsJson(valid);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toEqual(JSON.parse(valid));
  });

  it('recovers JSON truncated mid-second-finding', () => {
    const full = JSON.stringify({
      findings: [
        { severity: 'high', title: 'Issue One', description: 'desc', file: 'a.ts', diffLines: '+foo' },
        { severity: 'low',  title: 'Issue Two', description: 'desc', file: 'a.ts', diffLines: '+bar' },
      ],
    });
    // Truncate mid-way through the second finding (after the title value)
    const truncated = full.slice(0, full.indexOf('"Issue Two"') + '"Issue Two"'.length);
    const result = recoverTruncatedFindingsJson(truncated);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    // Should have recovered at least the first complete finding
    expect(parsed.findings.length).toBeGreaterThanOrEqual(1);
    expect(parsed.findings[0].title).toBe('Issue One');
  });

  it('recovers JSON truncated after last complete finding', () => {
    const complete = { severity: 'critical', title: 'Hardcoded Secret', description: 'desc', file: 'b.ts', diffLines: '+key=' };
    const truncatedAfter = `{"findings": [${JSON.stringify(complete)},`;
    const result = recoverTruncatedFindingsJson(truncatedAfter);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].title).toBe('Hardcoded Secret');
  });

  it('handles real-world truncation at position ~6500 chars', () => {
    // Simulate a long AI response with 5 findings, truncated mid-sixth
    const findings = Array.from({ length: 5 }, (_, i) => ({
      severity: 'medium',
      category: 'security',
      title: `Finding number ${i + 1} with a reasonably long title`,
      description: 'A'.repeat(300),
      file: 'src/main.ts',
      diffLines: `+line${i}`,
      suggestion: 'Fix it',
    }));
    const full = JSON.stringify({ findings });
    // Truncate after 6th opening brace (mid-sixth finding that doesn't exist)
    const truncated = full.slice(0, full.length - 2) + ', {"severity": "high", "title": "Trun';
    const result = recoverTruncatedFindingsJson(truncated);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.findings).toHaveLength(5);
  });
});

describe('isDiffLinesAllComments', () => {
  it('returns false for an empty string', () => {
    expect(isDiffLinesAllComments('')).toBe(false);
  });

  it('returns false for a normal code line', () => {
    expect(isDiffLinesAllComments('+const x = 1;')).toBe(false);
  });

  it('returns true for a JS single-line comment', () => {
    expect(isDiffLinesAllComments('+// this is commented out')).toBe(true);
  });

  it('returns true for a shell/Python/YAML comment', () => {
    expect(isDiffLinesAllComments('+# commented line')).toBe(true);
  });

  it('returns true for a block comment start', () => {
    expect(isDiffLinesAllComments('+/* begin block')).toBe(true);
  });

  it('returns true for a block comment continuation', () => {
    expect(isDiffLinesAllComments('+* middle of block')).toBe(true);
  });

  it('returns true for a block comment end', () => {
    expect(isDiffLinesAllComments('+*/')).toBe(true);
  });

  it('returns true for an HTML comment', () => {
    expect(isDiffLinesAllComments('+<!-- html comment -->')).toBe(true);
  });

  it('returns true when all multi-line diffLines are comments', () => {
    const multiLine = '+// first comment\n+// second comment';
    expect(isDiffLinesAllComments(multiLine)).toBe(true);
  });

  it('returns false when mixed comment and code lines', () => {
    const mixed = '+// comment\n+const x = 1;';
    expect(isDiffLinesAllComments(mixed)).toBe(false);
  });

  it('strips diff prefix before checking (- lines)', () => {
    expect(isDiffLinesAllComments('-// removed comment')).toBe(true);
  });

  it('strips diff prefix before checking (context lines with space)', () => {
    expect(isDiffLinesAllComments(' // context comment')).toBe(true);
  });
});

describe('parseSkillResponse', () => {
  const skill: ReviewSkill = {
    id: 'test-skill',
    name: 'Test Skill',
    version: '1.0.0',
    certificationLevel: 'stable',
    systemPrompt: 'Test system prompt',
    focus: 'Quality',
    categories: ['quality'],
    antiHallucinationRules: [],
    requiredCitations: false,
  };

  it('parses JSON inside code fences and normalizes severities', () => {
    const text = `
      some preface text
      \`\`\`json
      {
        "findings": [{
          "severity": "HIGH",
          "category": "security",
          "title": "SQL Injection",
          "description": "Parameter not sanitized",
          "diffLines": "+execute(query)"
        }],
        "reasoning": ["Identified vulnerable query construction"]
      }
      \`\`\`
    `;

    const result = parseSkillResponse(text, 'db.ts', skill);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      severity: 'high',
      category: 'security',
      title: 'SQL Injection',
      description: 'Parameter not sanitized',
      file: 'db.ts',
      diffLines: '+execute(query)',
    });
    expect(result.reasoning).toEqual(['Identified vulnerable query construction']);
  });

  it('drops findings that fail schema validation while keeping valid ones', () => {
    const text = JSON.stringify({
      findings: [
        { severity: 123, title: 'Invalid type' },
        { severity: 'low', title: 'Valid finding', description: 'desc', diffLines: '+line' },
        'not-an-object',
      ],
    });

    const result = parseSkillResponse(text, 'app.ts', skill);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      severity: 'low',
      category: 'quality',
      title: 'Valid finding',
      description: 'desc',
      file: 'app.ts',
      diffLines: '+line',
    });
  });

  it('attempts to recover truncated responses before validation', () => {
    const truncated = '{"findings":[{"severity":"medium","title":"Partial finding","description":"desc","diffLines":"+line"}';

    const result = parseSkillResponse(truncated, 'server.ts', skill);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      severity: 'medium',
      title: 'Partial finding',
      description: 'desc',
      file: 'server.ts',
      diffLines: '+line',
    });
  });

  it('falls back to brace extraction when non-json fence is present', () => {
    const text = `
      Here's a diff fence before the JSON:
      \`\`\`diff
      - old code
      + new code
      \`\`\`

      And here's the JSON:
      {
        "findings": [{
          "severity": "high",
          "title": "Security Issue",
          "description": "This is important"
        }]
      }
    `;

    const result = parseSkillResponse(text, 'test.ts', skill);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      severity: 'high',
      title: 'Security Issue',
      description: 'This is important',
    });
  });

  it('preserves valid findings even when reasoning contains invalid values', () => {
    const text = JSON.stringify({
      findings: [
        { severity: 'critical', title: 'Critical bug', description: 'desc' },
      ],
      reasoning: ['Valid reasoning', '', 123, null, 'Another valid one'],
    });

    const result = parseSkillResponse(text, 'app.ts', skill);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('critical');
    // Should filter reasoning to only valid non-empty strings
    expect(result.reasoning).toEqual(['Valid reasoning', 'Another valid one']);
  });

  it('returns undefined reasoning when all reasoning values are invalid', () => {
    const text = JSON.stringify({
      findings: [
        { severity: 'low', title: 'Minor issue', description: 'desc' },
      ],
      reasoning: ['', '   ', 123, null],
    });

    const result = parseSkillResponse(text, 'app.ts', skill);
    expect(result.findings).toHaveLength(1);
    expect(result.reasoning).toBeUndefined();
  });
});
