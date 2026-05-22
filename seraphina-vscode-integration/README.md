# Seraphina VSCode Integration

A hybrid AI code auditor that runs **four specialist Grok agents in parallel** and synthesises a **Roman Wheel consensus** with a numeric truth score and divergence map.

## Features

- **`Seraphina: Audit Current File with Roman Wheel Consensus`** — runs four agents (Quality, Security, Performance, Maintainability) in parallel, computes a weighted truth score (0-100) and an inter-agent agreement score, and opens an interactive Truth Validation panel plus a Markdown report.
- **`Seraphina: Glyph Pattern Analysis`** — deterministic static pass (loops, branches, async tokens, error-handling, IO, TODO flags) plus a short Grok narrative interpreting the shape of the file. Works without a key (static-only) and adds the narrative when keys are present.
- **`Seraphina: Open Truth Validation Panel`** — reopens the last consensus report as a webview with a Roman Wheel SVG and per-agent cards.
- **`Seraphina: Set Grok API Keys`** — secure key entry (up to 4 keys, stored via VS Code `SecretStorage`). 1 key works; 4 keys parallelise across the agents.

## Setup

1. `npm install`
2. `npm run compile` (or `npm run watch` for active development)
3. Press **F5** to launch the Extension Development Host.
4. In the dev host: open the Command Palette, run **Seraphina: Set Grok API Keys**, paste 1-4 xAI keys from <https://console.x.ai>.
5. Open any source file and run **Seraphina: Audit Current File with Roman Wheel Consensus**.

## Settings

| Setting | Default | Description |
|---|---|---|
| `seraphina.model` | `grok-4-1-fast-reasoning` | Grok model used by each agent. |
| `seraphina.maxTokensPerAgent` | `2400` | Per-agent response cap. |
| `seraphina.temperature` | `0.2` | Sampling temperature. |

## How the Roman Wheel score works

Each agent returns a JSON verdict: `score` (0-10), `confidence` (0-1), `summary`, `findings[]`.

- **Truth Score** = confidence-weighted mean of scores, mapped to 0-100.
- **Agreement** = `1 - (stddev of scores / 5)`, clamped to `[0, 1]`. High agreement means all four specialists landed on similar scores.
- A low truth score + high agreement = the file genuinely has problems all four lenses see. A high truth score + low agreement = the agents disagree, which itself is a signal worth investigating.

## Packaging

```bash
npm run package
npx vsce package
```

## License

MIT
