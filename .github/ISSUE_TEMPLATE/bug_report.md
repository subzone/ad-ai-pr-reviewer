---
name: Bug report
about: Something isn't working as expected
labels: bug
---

## Describe the bug
A clear description of what went wrong.

## Pipeline step configuration
```yaml
# Paste your task configuration here (remove any secret values)
- task: AiPrReviewer@1
  inputs:
    action:
    provider:
    ...
```

## Pipeline log output
```
Paste the relevant section of the pipeline log here
```

## Expected behaviour
What did you expect to happen?

## Environment
- Extension version:
- Provider: (GitHub / GitLab / Bitbucket Cloud / Bitbucket Server)
- ADO agent OS: (ubuntu-latest / windows-latest / self-hosted)
- AI model used (if applicable):
