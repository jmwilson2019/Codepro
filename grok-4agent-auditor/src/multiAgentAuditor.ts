
import { GrokClientPool } from './grokClient';

const AGENT_ROLES = [
  { name: "Architect", focus: "high-level architecture, structure, design patterns" },
  { name: "Security", focus: "vulnerabilities, risks, compliance" },
  { name: "Performance", focus: "efficiency, bottlenecks, optimization" },
  { name: "Quality", focus: "readability, best practices, refactoring" }
];

export interface AgentSuggestion {
  agent: string;
  explanation: string;
  code?: string;
}

export class MultiAgentAuditor {
  private pool: GrokClientPool;

  constructor() {
    this.pool = new GrokClientPool();
  }

  async auditCode(code: string, filePath?: string, isProject = false): Promise<{ suggestions: AgentSuggestion[], synthesis: string, file: string }> {
    if (code.trim() === '') {
      return { suggestions: [{ agent: 'Error', explanation: 'No code content was provided to audit.' }], synthesis: '', file: filePath || 'Untitled' };
    }

    await this.pool.init();

    const clients = this.pool.getAllClients();
    if (clients.length === 0) {
      throw new Error("No Grok API keys configured. Please add them in Settings.");
    }

    const model = "grok-4";

    if (isProject) {
      return { suggestions: [{ agent: 'Project', explanation: 'Full project scanning is not implemented yet.' }], synthesis: '', file: filePath || 'Untitled' };
    }

    const prompts = AGENT_ROLES.map(role =>
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
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 700
          });
          const content = res.choices[0]?.message?.content || "No response";
          // Try to extract code block if present
          const codeMatch = content.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
          const code = codeMatch ? codeMatch[1].trim() : undefined;
          // Remove code block from explanation
          const explanation = codeMatch ? content.replace(codeMatch[0], '').trim() : content.trim();
          return {
            agent: AGENT_ROLES[i].name,
            explanation,
            code
          };
        } catch (err: any) {
          return { agent: AGENT_ROLES[i].name, explanation: `Error: ${err.message}` };
        }
      })
    );

    const synthesisPrompt = `You are the Lead Auditor. Synthesize these 4 reports into a clear executive summary with prioritized findings and recommended actions.\n\n` +
      responses.map(r => `=== ${r.agent} ===\n${r.explanation}\n${r.code ? '\n[Code suggestion present]' : ''}\n`).join('\n');

    const leadClient = this.pool.getNextClient() as any;
    const finalRes = await leadClient.chat.completions.create({
      model,
      messages: [{ role: "user", content: synthesisPrompt }],
      temperature: 0.5,
      max_tokens: 600
    });

    return {
      suggestions: responses,
      synthesis: finalRes.choices[0]?.message?.content || 'No synthesis generated',
      file: filePath || 'Untitled'
    };
  }
}