import * as vscode from 'vscode';
import * as path from 'path';
import { GrokClientPool } from './grokClient';

const AGENT_ROLES = [
  { name: 'Architect', focus: 'high-level architecture, structure, design patterns' },
  { name: 'Security', focus: 'vulnerabilities, risks, compliance, OWASP Top 10' },
  { name: 'Performance', focus: 'efficiency, bottlenecks, optimisation, scalability' },
  { name: 'Quality', focus: 'readability, best practices, refactoring, testability' },
];

export interface AgentSuggestion {
  agent: string;
  explanation: string;
  code?: string;
}

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
  truthScore: number; // 0-100
  agreement: number; // 0-1
  verdicts: AgentVerdict[];
  synthesis: string;
  generatedAt: number;
}

const LANGUAGE_HINTS: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript', jsx: 'JavaScript React',
  py: 'Python', java: 'Java', go: 'Go', rs: 'Rust', cs: 'C#', cpp: 'C++', c: 'C',
  rb: 'Ruby', php: 'PHP', swift: 'Swift', kt: 'Kotlin', scala: 'Scala',
  sh: 'Shell', ps1: 'PowerShell', sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS',
  md: 'Markdown', yaml: 'YAML', yml: 'YAML', json: 'JSON',
};

function detectLanguage(filePath: string, fallback?: string): string {
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  return LANGUAGE_HINTS[ext] || fallback || 'plaintext';
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw.trim()); } catch { /* try fenced */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
  return null;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export class MultiAgentAuditor {
  private pool: GrokClientPool;

  constructor(private context?: vscode.ExtensionContext) {
    this.pool = new GrokClientPool();
  }

  /** Legacy method used by the existing grok4agent.auditCurrentFile command + apply/ignore webview. */
  async auditCode(
    code: string,
    filePath?: string,
    isProject = false
  ): Promise<{ suggestions: AgentSuggestion[]; synthesis: string; file: string }> {
    if (code.trim() === '') {
      return { suggestions: [{ agent: 'Error', explanation: 'No code content was provided to audit.' }], synthesis: '', file: filePath || 'Untitled' };
    }

    await this.pool.init(this.context);
    const clients = this.pool.getAllClients();
    if (clients.length === 0) {
      throw new Error('No Grok API keys configured. Please add them in Settings or run "Grok 4-Agent: Set API Keys".');
    }

    const model = vscode.workspace.getConfiguration('grok4agent').get<string>('model', 'grok-4');

    if (isProject) {
      return { suggestions: [{ agent: 'Project', explanation: 'Full project scanning is not implemented yet.' }], synthesis: '', file: filePath || 'Untitled' };
    }

    const prompts = AGENT_ROLES.map((role) =>
      `You are the ${role.name} expert auditing this code.\n` +
      `Focus ONLY on: ${role.focus}\n\n` +
      (filePath ? `File: ${filePath}\n` : '') +
      `Code:\n${code}\n\n` +
      `Provide concise, actionable findings and recommendations. If you recommend a code change, output it as a markdown code block after your explanation.`
    );

    const responses = await Promise.all(
      prompts.map(async (prompt, i) => {
        const client = clients[i % clients.length] as any;
        try {
          const res = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 700,
          });
          const content = res.choices[0]?.message?.content || 'No response';
          const codeMatch = content.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
          const codeBlock = codeMatch ? codeMatch[1].trim() : undefined;
          const explanation = codeMatch ? content.replace(codeMatch[0], '').trim() : content.trim();
          return { agent: AGENT_ROLES[i].name, explanation, code: codeBlock } as AgentSuggestion;
        } catch (err: any) {
          return { agent: AGENT_ROLES[i].name, explanation: `Error: ${err.message}` } as AgentSuggestion;
        }
      })
    );

    const synthesisPrompt =
      `You are the Lead Auditor. Synthesize these 4 reports into a clear executive summary with prioritized findings and recommended actions.\n\n` +
      responses.map((r) => `=== ${r.agent} ===\n${r.explanation}\n${r.code ? '\n[Code suggestion present]' : ''}\n`).join('\n');

    const leadClient = this.pool.getNextClient() as any;
    const finalRes = await leadClient.chat.completions.create({
      model,
      messages: [{ role: 'user', content: synthesisPrompt }],
      temperature: 0.5,
      max_tokens: 600,
    });

    return {
      suggestions: responses,
      synthesis: finalRes.choices[0]?.message?.content || 'No synthesis generated',
      file: filePath || 'Untitled',
    };
  }

  /** New: 4-agent parallel run with structured JSON verdicts and Roman Wheel consensus. */
  async auditWithConsensus(
    code: string,
    filePath: string,
    languageId?: string,
    onProgress?: (msg: string) => void
  ): Promise<ConsensusReport> {
    await this.pool.init(this.context);

    const language = detectLanguage(filePath, languageId);
    const cfg = vscode.workspace.getConfiguration('grok4agent');
    const model = cfg.get<string>('model', 'grok-4');
    const temperature = cfg.get<number>('temperature', 0.2);
    const maxTokens = cfg.get<number>('maxTokensPerAgent', 2400);

    onProgress?.(`Dispatching ${AGENT_ROLES.length} agents (${this.pool.getClientCount()} key(s))...`);

    const verdicts = await Promise.all(
      AGENT_ROLES.map((role, idx) => this.runAgent(role, idx, code, filePath, language, model, temperature, maxTokens))
    );

    onProgress?.('Synthesising Roman Wheel consensus...');

    const valid = verdicts.filter((v) => !v.error);
    const truthScore = this.calculateTruthScore(verdicts);
    const agreement = this.calculateAgreement(valid);
    const synthesis = this.buildSynthesis(verdicts, filePath, language, truthScore, agreement);

    return { filePath, language, truthScore, agreement, verdicts, synthesis, generatedAt: Date.now() };
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
    const client = this.pool.getClient(agentIndex) as any;
    const prompt = `You are the ${role.name} agent in a 4-agent code auditing council. You only speak about: ${role.focus}.

Audit the following ${language} file and return STRICT JSON only — no prose outside the JSON, no markdown fences:
{
  "score": <integer 0-10, where 10 is excellent>,
  "confidence": <number 0-1>,
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
        return { agent: role.name, focus: role.focus, score: 5, confidence: 0.2, summary: 'Agent response could not be parsed as JSON.', findings: [], raw, error: 'parse_error' };
      }
      return {
        agent: role.name,
        focus: role.focus,
        score: clampNumber(parsed.score, 0, 10, 5),
        confidence: clampNumber(parsed.confidence, 0, 1, 0.5),
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        findings: Array.isArray(parsed.findings) ? parsed.findings.map((f: unknown) => String(f)).slice(0, 6) : [],
        raw,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { agent: role.name, focus: role.focus, score: 0, confidence: 0, summary: `Agent failed: ${message}`, findings: [], raw: '', error: message };
    }
  }

  private calculateTruthScore(verdicts: AgentVerdict[]): number {
    const usable = verdicts.filter((v) => !v.error);
    if (usable.length === 0) return 0;
    let weightedSum = 0;
    let weightTotal = 0;
    for (const v of usable) {
      const w = Math.max(0.1, v.confidence);
      weightedSum += v.score * w;
      weightTotal += w;
    }
    return Math.round((weightedSum / weightTotal) * 10);
  }

  private calculateAgreement(verdicts: AgentVerdict[]): number {
    if (verdicts.length < 2) return verdicts.length === 1 ? 1 : 0;
    const scores = verdicts.map((v) => v.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
    const stddev = Math.sqrt(variance);
    return Math.max(0, 1 - Math.min(1, stddev / 5));
  }

  private buildSynthesis(verdicts: AgentVerdict[], filePath: string, language: string, truthScore: number, agreement: number): string {
    const lines: string[] = [];
    lines.push(`# Grok 4-Agent · Roman Wheel Consensus`);
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
      if (v.error) { lines.push(''); lines.push(`> ⚠️ ${v.error}`); continue; }
      if (v.summary) { lines.push(''); lines.push(v.summary); }
      if (v.findings.length > 0) {
        lines.push('');
        for (const f of v.findings) lines.push(`- ${f}`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push(
      agreement >= 0.7 ? '_Council reached strong consensus._' :
      agreement >= 0.4 ? '_Council reached partial consensus — review divergent findings._' :
                         '_Council is divided — treat findings as competing perspectives, not ground truth._'
    );
    return lines.join('\n');
  }
}
