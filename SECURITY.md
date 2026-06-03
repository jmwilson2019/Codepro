# Security Policy

## Reporting a Vulnerability

Please report vulnerabilities privately through GitHub Security Advisories:
https://github.com/jmwilson2019/Codepro/security/advisories/new

## Secret handling

API keys and other credentials must never be committed to the repository or stored in `.vscode/settings.json`.

For `grok-4agent-auditor`, store keys using VS Code SecretStorage via `GrokClientPool.storeKeys` in `grok-4agent-auditor/src/extension.ts`.

## Supported versions

| Version | Supported |
| --- | --- |
| 3.5.x | ✅ |
| < 3.5.0 | ❌ |
