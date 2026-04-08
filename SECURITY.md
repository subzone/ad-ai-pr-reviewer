# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.0.x | ✅ |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately via [GitHub Security Advisories](https://github.com/subzone/ad-ai-pr-reviewer/security/advisories/new).

Include as much detail as possible:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You can expect an acknowledgement within 48 hours and a resolution or mitigation plan within 14 days.

## Secrets Handling

This task handles sensitive credentials (PATs, API keys). A few reminders:

- **Always** store tokens in secret pipeline variables — never hard-code them in pipeline YAML
- Tokens are passed via environment variables and are never logged or persisted by the task
- The task does not transmit credentials anywhere other than the configured provider API and Anthropic API endpoints
