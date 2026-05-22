# Changelog

## 3.4.2 — 2026-05-21

### Changed
- Repository / bugs / Q&A URLs now point to the live monorepo at `https://github.com/jmwilson2019/Codepro` (subfolder `grok-4agent-auditor`). This makes the Marketplace "Report Issue" button and Q&A tab work immediately. A `release/synergro-ai` branch retains the prospective `SynerGro-AI/grok-4agent-auditor` URLs for a future migration.
- `repository.directory` set to `grok-4agent-auditor` so package managers and GitHub link to the right subfolder.

## 3.4.1 — 2026-05-21

### Added
- **Feedback command** `Grok 4-Agent: Report an Issue / Send Feedback` — pick "Report a Bug", "Ask a Question", or "Rate the Extension" to open the right page directly from VS Code.
- Marketplace metadata: `bugs.url`, `homepage`, `qna`, `keywords`, `categories` so the Marketplace listing shows a "Report Issue" button and a Q&A tab.

## 3.4.0 — 2026-05-21

### Added
- **Roman Wheel Consensus audit** (`Grok 4-Agent: Audit Current File with Roman Wheel Consensus`): runs four specialist agents (Architect, Security, Performance, Quality) in parallel, returns structured JSON verdicts, and computes a confidence-weighted Truth Score (0–100) plus an inter-agent agreement metric.
- **Truth Validation Panel** (`Grok 4-Agent: Open Truth Validation Panel`): interactive webview with an SVG Roman Wheel and per-agent cards.
- **Glyph Analysis** (`Grok 4-Agent: Glyph Pattern Analysis`): deterministic static pass over loops, branches, async/IO/error-handling glyphs, plus an AI-narrated interpretation. Works without keys for the static pass.
- **Secure key storage**: new `Grok 4-Agent: Set API Keys (Secure)` command uses VS Code `SecretStorage` instead of plain-text settings. The legacy `grok4agent.apiKeys` setting still works as a fallback.
- New settings: `grok4agent.model`, `grok4agent.temperature`, `grok4agent.maxTokensPerAgent`.

### Changed
- `activationEvents` set to `onStartupFinished` so all commands are reachable from the Command Palette without first running the title-bar action.
- Command titles harmonised under the `Grok 4-Agent:` prefix.

### Backward compatibility
- The original `Grok 4-Agent: Audit Current File` command and its apply/copy/ignore webview are unchanged. Existing keybindings continue to work.
- Existing `grok4agent.apiKeys` settings are read transparently if no secret-storage keys are configured.
