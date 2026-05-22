import * as vscode from 'vscode';
import * as path from 'path';
import { GrokClientPool } from './grokClient';

export interface AgentVerdict {
  agent: string;
  focus: string;
  score: number; // 0-10
  confidence: number; // 0-1
  summary: string;
  findings: string[];
  raw: string;
  error?: string;
}

export interface ConsensusReport {
  filePath: string;
  language: string;
  truthScore: number; // 0-100 weighted consensus
  agreement: number; // 0-1 — how aligned the agents were
  verdicts: AgentVerdict[];
  synthesis: string;
  generatedAt: number;
}

export const AGENT_ROLES: ReadonlyArray<{ name: string; focus: string }> = [
  { name: 'Quality', focus: 'code style, readability, testability, idiomatic patterns, refactoring opportunities' },
  { name: 'Security', focus: 'security vulnerabilities, injection risks, authentication and authorization issues, data protection, OWASP Top 10' },
  { name: 'Performance', focus: 'performance bottlenecks, optimisation opportunities, resource usage, scalability, algorithmic complexity' },
  { name: 'Maintainability', focus: 'code structure, modularity, documentation, technical debt, future extensibility' },
];

const LANGUAGE_HINTS: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript React',
  js: 'JavaScript',
  jsx: 'JavaScript React',
  py: 'Python',
  java: 'Java',
  go: 'Go',
  rs: 'Rust',
  cs: 'C#',
  cpp: 'C++',
  c: 'C',
  rb: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
  scala: 'Scala',
  sh: 'Shell',
  ps1: 'PowerShell',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  md: 'Markdown',
  yaml: 'YAML',
  yml: 'YAML',
  json: 'JSON',
};

function detectLanguage(filePath: string, fallbackLanguageId?: string): string {
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  if (LANGUAGE_HINTS[ext]) {
    return LANGUAGE_HINTS[ext];
  }
  return fallbackLanguageId || 'plaintext';
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to extract the first {...} block
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export class MultiAgentAuditor {
  private pool: GrokClientPool;

  constructor(private context: vscode.ExtensionContext) {
    this.pool = new GrokClientPool();
  }

  async ensureReady(): Promise<void> {
    await this.pool.init(this.context);
  }

  /** Run all 4 agents in parallel and synthesise a Roman Wheel consensus. */
  async auditWithConsensus(
    code: string,
    filePath: string,
    languageId?: string,
    onProgress?: (msg: string) => void
  ): Promise<ConsensusReport> {
    await this.ensureReady();

    const language = detectLanguage(filePath, languageId);
    const model = vscode.workspace.getConfiguration('seraphina').get<string>('model', 'grok-4-1-fast-reasoning');
    const temperature = vscode.workspace.getConfiguration('seraphina').get<number>('temperature', 0.2);
    const maxTokens = vscode.workspace.getConfiguration('seraphina').get<number>('maxTokensPerAgent', 2400);

    onProgress?.(`Dispatching ${AGENT_ROLES.length} agents (${this.pool.getClientCount()} key(s))...`);

    const promises = AGENT_ROLES.map((role, idx) =>
      this.runAgent(role, idx, code, filePath, language, model, temperature, maxTokens)
    );
    const verdicts = await Promise.all(promises);

    onProgress?.('Synthesising Roman Wheel consensus...');

    const valid = verdicts.filter((v) => !v.error);
    const truthScore = this.calculateTruthScore(verdicts);
    const agreement = this.calculateAgreement(valid);
    const synthesis = this.buildSynthesis(verdicts, filePath, language, truthScore, agreement);

    return {
      filePath,
      language,
      truthScore,
      agreement,
      verdicts,
      synthesis,
      generatedAt: Date.now(),
    };
  }

  private async runAgent(
    role: { name: string; focus: string },
    agentIndex: number,
    code: string,
    filePath: string,
    language: string,
    model: string,
    temperature: number,
    maxTokens: number
  ): Promise<AgentVerdict> {
    const client = this.pool.getClient(agentIndex);

    const prompt = `You are the ${role.name} agent in a 4-agent code auditing council. You only speak about: ${role.focus}.

Audit the following ${language} file and return STRICT JSON only — no prose outside the JSON, no markdown fences:
{
  "score": <integer 0-10, where 10 is excellent>,
  "confidence": <number 0-1 — how confident you are in your verdict>,
  "summary": "<one or two sentences from your specialist angle>",
  "findings": ["<concise specific finding>", "<another>", "..."]
}

Keep findings concrete and actionable. Maximum 6 findings.

File: ${path.basename(filePath)}
Language: ${language}

\`\`\`${language.toLowerCase()}
${code.length > 18000 ? code.slice(0, 18000) + '\n\n[truncated]' : code}
\`\`\``;

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: `You are the ${role.name} specialist agent. Always respond with strict JSON.` },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
      });

      const raw = response.choices[0]?.message?.content ?? '{}';
      const parsed = safeParseJson(raw);
      if (!parsed) {
        return {
          agent: role.name,
          focus: role.focus,
          score: 5,
          confidence: 0.2,
          summary: 'Agent response could not be parsed as JSON.',
          findings: [],
          raw,
          error: 'parse_error',
        };
      }
      return {
        agent: role.name,
        focus: role.focus,
        score: clampNumber(parsed.score, 0, 10, 5),
        confidence: clampNumber(parsed.confidence, 0, 1, 0.5),
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        findings: Array.isArray(parsed.findings)
          ? parsed.findings.map((f: unknown) => String(f)).slice(0, 6)
          : [],
        raw,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        agent: role.name,
        focus: role.focus,
        score: 0,
        confidence: 0,
        summary: `Agent failed: ${message}`,
        findings: [],
        raw: '',
        error: message,
      };
    }
  }

  /** Roman Wheel truth score: weighted average of agent scores using their declared confidence. */
  private calculateTruthScore(verdicts: AgentVerdict[]): number {
    const usable = verdicts.filter((v) => !v.error);
    if (usable.length === 0) {
      return 0;
    }
    let weightedSum = 0;
    let weightTotal = 0;
    for (const v of usable) {
      const w = Math.max(0.1, v.confidence);
      weightedSum += v.score * w;
      weightTotal += w;
    }
    const mean = weightedSum / weightTotal; // 0-10
    return Math.round(mean * 10); // 0-100
  }

  /** Agreement = 1 - normalised stddev of scores. 1 means all agents agree. */
  private calculateAgreement(verdicts: AgentVerdict[]): number {
    if (verdicts.length < 2) {
      return verdicts.length === 1 ? 1 : 0;
    }
    const scores = verdicts.map((v) => v.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
    const stddev = Math.sqrt(variance);
    // Max possible stddev across 0..10 ≈ 5; normalise.
    const normalised = Math.min(1, stddev / 5);
    return Math.max(0, 1 - normalised);
  }

  private buildSynthesis(
    verdicts: AgentVerdict[],
    filePath: string,
    language: string,
    truthScore: number,
    agreement: number
  ): string {
    const lines: string[] = [];
    lines.push(`# Seraphina Roman Wheel Consensus`);
    lines.push('');
    lines.push(`**File:** \`${path.basename(filePath)}\``);
    lines.push(`**Language:** ${language}`);
    lines.push(`**Truth Score:** ${truthScore} / 100`);
    lines.push(`**Agent Agreement:** ${(agreement * 100).toFixed(0)}%`);
    lines.push('');
    lines.push('## Agents');
    for (const v of verdicts) {
      lines.push('');
      lines.push(`### ${v.agent}  —  score ${v.score}/10  (confidence ${(v.confidence * 100).toFixed(0)}%)`);
      lines.push(`_Focus: ${v.focus}_`);
      if (v.error) {
        lines.push('');
        lines.push(`> ⚠️ ${v.error}`);
        continue;
      }
      if (v.summary) {
        lines.push('');
        lines.push(v.summary);
      }
      if (v.findings.length > 0) {
        lines.push('');
        for (const f of v.findings) {
          lines.push(`- ${f}`);
        }
      }
    }
    lines.push('');
    lines.push('---');
    lines.push(
      agreement >= 0.7
        ? '_Council reached strong consensus._'
        : agreement >= 0.4
        ? '_Council reached partial consensus — review divergent findings._'
        : '_Council is divided — treat findings as competing perspectives, not ground truth._'
    );
    return lines.join('\n');
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}
