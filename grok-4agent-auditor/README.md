Grok 4-Agent Auditor

Enterprise-level code auditing powered by 4 collaborating Grok AI agents (you provide API keys).

## Quick Start

1. Install the extension from the VSCode marketplace: Search for "Grok 4-Agent Auditor" or visit https://marketplace.visualstudio.com/items?itemName=SynerGroAICorp.grok-4agent-auditor
2. Open Settings (Ctrl+,), search for "grok4agent", and add your 4 Grok API keys to the array.
3. Open any code file, run "Grok 4-Agent: Audit Current File" via Ctrl+Shift+P.
4. For full project audits: Run "Grok 4-Agent: Audit Entire Project" (implementation in progress).

The extension will:
- Call your 4 API keys in parallel (Architect, Security, Performance, Quality agents).
- Synthesize a final executive report.
- Open the Markdown report in a new editor tab.

## Models
- Default: grok-4.20-0309-reasoning
- Change in settings: grok4agent.defaultModel

## Next Features
Say "add project audit", "add webview panel", etc. to expand.

## Development
For development:
1. Open terminal in grok-4agent-auditor folder.
2. Run npm run watch to compile in watch mode.
3. Press F5 to launch Extension Development Host window.

## Package for Distribution
npm run package → creates .vsix file. #why can't we just hit a button or a keyboard short cut, we shouldn't need to go to development