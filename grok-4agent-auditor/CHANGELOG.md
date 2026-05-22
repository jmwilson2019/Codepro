# Changelog

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
