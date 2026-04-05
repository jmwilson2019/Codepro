import * as vscode from 'vscode';
import { GrokClientPool } from './grokClient';

const AGENT_ROLES = [
  { name: "Architect", focus: "structure, layers, Roman Wheel, glyph design" },
  { name: "Security", focus: "verification, consensus, risks, determinism" },
  { name: "Performance", focus: "efficiency, binary math, optimization" },
  { name: "Quality", focus: "readability, glyph rules, layer separation" }
];

export class MultiAgentAuditor {
  private pool: GrokClientPool;

  constructor() {                    // ← Fixed: no context parameter
    this.pool = new GrokClientPool();
  }

  async auditCode(code: string, filePath?: string, isProject = false): Promise<string> {
    await this.pool.init();           // ← Fixed: no argument

    const clients = this.pool.getAllClients();
    if (clients.length === 0) {
      throw new Error("No Grok API keys configured.");
    }

    // Force your strong multi-agent model
    const model = "grok-4.20-multi-agent-0309";

    if (isProject) {
      return "# Project Audit\n\nFull project scanning is not implemented yet.";
    }

    const glyphHeader = "Octa v2.1 Glyph Code - Binary-first with strict Optical (human) vs Binary Execution (Roman Wheel + WASM) separation.\n\n";

    const prompts = AGENT_ROLES.map(role =>
      `You are the ${role.name} Agent.\n` +
      `Focus ONLY on: ${role.focus}\n` +
      glyphHeader +
      (filePath ? `File: ${filePath}\n` : '') +
      `Code:\n\`\`\`python\n${code}\n\`\`\`\n\n` +
      `Keep response concise and actionable.`
    );

    // Parallel with generous but safe timeouts
    const responses = await Promise.all(
      prompts.map(async (prompt, i) => {
        const client = clients[i % clients.length];
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Agent timed out (too slow)')), 55000)
          );

          const apiPromise = client.chat.completions.create({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.65,
            max_tokens: 850
          });

          const res = await Promise.race([apiPromise, timeoutPromise]) as any;
          return {
            agent: AGENT_ROLES[i].name,
            content: res.choices[0]?.message?.content || "No response"
          };
        } catch (err: any) {
          return { agent: AGENT_ROLES[i].name, content: `Error: ${err.message}` };
        }
      })
    );

    // Quick synthesis
    const synthesisPrompt = `Lead Auditor: Summarize the 4 reports into key findings and recommendations for this Octa v2.1 glyph code.\n\n` +
      responses.map(r => `=== ${r.agent} ===\n${r.content}\n`).join('\n');

    const leadClient = this.pool.getNextClient();
    const finalRes = await leadClient.chat.completions.create({
      model,
      messages: [{ role: "user", content: synthesisPrompt }],
      temperature: 0.5,
      max_tokens: 700
    });

    let report = `# 4-Agent Grok Audit (4.20-multi)\n\n**File:** ${filePath || 'Untitled'}\n\n`;

    responses.forEach(r => {
      report += `## ${r.agent} Agent\n${r.content}\n\n`;
    });

    report += `## Final Synthesis\n${finalRes.choices[0]?.message?.content || 'No synthesis generated'}`;

    return report;
  }
}