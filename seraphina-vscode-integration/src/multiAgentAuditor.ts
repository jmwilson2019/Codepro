import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { GrokClientPool } from './grokClient';

const AGENT_ROLES = [
  { name: "Quality", focus: "code style, readability, testability, best practices, refactoring suggestions" },
  { name: "Security", focus: "security vulnerabilities, injection risks, authentication issues, data protection" },
  { name: "Performance", focus: "performance bottlenecks, optimization opportunities, resource usage, scalability" },
  { name: "Maintainability", focus: "code structure, modularity, documentation, technical debt, future extensibility" }
];

export class MultiAgentAuditor {
  private pool: GrokClientPool;

  constructor(private context: vscode.ExtensionContext) {
    this.pool = new GrokClientPool();
  }

  async auditCode(code: string, filePath: string): Promise<string> {
    try {
      await this.pool.init(this.context);
      const client = this.pool.getNextClient();

    const codeHash = crypto.createHash('sha256').update(code + filePath).digest('hex');
    const cacheKey = `grok.audit.v1.${codeHash.slice(0, 16)}`;
    const cached = this.context.globalState.get(cacheKey) as { msg: string; ts: number } | undefined;
    if (cached && Date.now() - cached.ts < 3600000) { // 1 hour cache
      vscode.window.showInformationMessage('✅ Using cached audit (code unchanged)');
      return cached.msg;
    }

    const prompt = `You are a Principal React Architect with 15+ years of experience building enterprise-scale applications. You excel at modern React patterns, performance optimization, accessibility, and maintainable code architecture.

Task: Completely understand this component and **rebuild it from scratch** into a clean, modern, enterprise-grade React dashboard.

If the component is complex, break it into multiple files (main component + sub-components + types/utils).

Do the following:
- Analyze what the component is actually for
- Break it down into logical, reusable sub-components (don't keep it monolithic)
- Add comprehensive TypeScript interfaces and types
- Implement proper error handling with ErrorBoundary
- Use React.lazy + Suspense for heavy sections
- Add React.memo where it makes sense
- Extract all magic numbers, strings, and styles into constants or theme objects
- Improve accessibility significantly (ARIA, roles, labels, focus management)
- Make the code self-documenting and easy to maintain
- Use modern 2026 React patterns

Return ONLY this JSON:

` + JSON.stringify({
  purpose: "Clear 1-2 sentence description of what this component does",
  summary: "Bullet list of the major architectural improvements",
  benchmarks: {
    performance: "Estimated speed improvement (e.g. 2x faster renders)",
    bundleSize: "Estimated bundle size reduction (e.g. -25%)",
    maintainability: "Score 1-10 or qualitative (e.g. 'Much improved')",
    security: "Key security enhancements"
  },
  files: [
    {
      path: "MainComponent.tsx",
      code: "complete code for this file"
    },
    {
      path: "SubComponent.tsx",
      code: "complete code for this file"
    }
  ]
}) + `

File: ` + path.basename(filePath) + `

Original code:
\`\`\`tsx
` + code + `
\`\`\``;

      const response = await client.chat.completions.create({
        model: 'grok-4-1-fast-reasoning',
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 16000
      });

      let raw = response.choices[0].message.content || '{}';
      // Try to extract JSON from the response if it has extra text
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        raw = jsonMatch[0];
      }
      let result: any;
      try {
        result = JSON.parse(raw);
      } catch (e) {
        return `Failed to parse JSON response.\n\nRaw:\n${raw}`;
      }

      const previewText = `**Purpose:** ${result.purpose || 'N/A'}\n\n**Summary:**\n${Array.isArray(result.summary) ? result.summary.join('\n• ') : (result.summary || 'None')}\n\n**Benchmarks:**\n${JSON.stringify(result.benchmarks || {}, null, 2)}\n\n**Files Generated:** ${result.files?.length || 0}`;

      const shouldApply = await vscode.window.showInformationMessage(
        `Ready to apply full enterprise rebuild? (${result.files?.length || 0} files)`,
        { modal: true, detail: previewText.slice(0, 2000) },
        'Apply Full Rebuild',
        'Cancel'
      );

let finalMsg: string;
  if (shouldApply === 'Apply Full Rebuild' && result.files?.length > 0) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const baseDir = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(filePath);
    await this.applyMultipleFiles(result.files, baseDir);
    finalMsg = `✅ Full enterprise rebuild applied to ${result.files.length} files!\n\n**Purpose:** ${result.purpose}\n\n**Summary:**\n${Array.isArray(result.summary) ? result.summary.join('\n• ') : result.summary}\n\n**Benchmarks:**\n${JSON.stringify(result.benchmarks || {}, null, 2)}`;
  } else {
    finalMsg = `**Analysis Complete**\n\n**Purpose:** ${result.purpose || 'N/A'}\n\n**Summary:**\n${Array.isArray(result.summary) ? result.summary.join('\n• ') : result.summary || 'None'}\n\n**Benchmarks:**\n${JSON.stringify(result.benchmarks || {}, null, 2)}`;
  }

  // Cache the result
  this.context.globalState.update(cacheKey, { msg: finalMsg, ts: Date.now() });

  return finalMsg;

    } catch (err: any) {
      return `❌ Audit failed: ${err.message}`;
    }
  }

  async auditProject(): Promise<string> {
    try {
      await this.pool.init(this.context);
    } catch (err: any) {
      return `❌ ${err.message}\n\nPlease run **Grok4Agent: Set API Keys** and use fresh keys from https://console.x.ai`;
    }

    let result = '';

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Grok 4-Agent Project Audit",
      cancellable: true
    }, async (progress, token) => {

      progress.report({ message: "Finding source files..." });

      const include = '**/*.{ts,js,tsx,jsx,py,java,go,rs,cs,cpp,c}';
      const exclude = '{**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/*.json,**/*.md,**/*.yaml,**/*.yml,**/test/**,**/tests/**,**/coverage/**,**/node_modules/**}';

      const uris = await vscode.workspace.findFiles(include, exclude, 500); // increased limit

      if (uris.length === 0) {
        result = '**No source files found.** Open a folder containing code.';
        return;
      }

      progress.report({ message: `Found ${uris.length} files. Reading contents in batches...` });

      // === Batch Reading (Better than your current approach) ===
      const fileContents: Array<{path: string, content: string, language: string}> = [];

      const batchSize = 8;
      for (let i = 0; i < uris.length; i += batchSize) {
        if (token.isCancellationRequested) break;

        const batch = uris.slice(i, i + batchSize);

        const batchResults = await Promise.all(
          batch.map(async (uri) => {
            try {
              const doc = await vscode.workspace.openTextDocument(uri);
              let content = doc.getText();

              // Skip very large files
              if (content.length > 25000) {
                content = content.substring(0, 20000) + '\n\n[File truncated due to size]';
              }

              return {
                path: uri.fsPath,
                content,
                language: doc.languageId || 'plaintext'
              };
            } catch (err) {
              console.warn(`Failed to read ${uri.fsPath}`);
              return null;
            }
          })
        );

        fileContents.push(...batchResults.filter(Boolean) as any);
        progress.report({
          message: `Read ${fileContents.length}/${uris.length} files...`
        });
      }

      // === Audit Phase ===
      progress.report({ message: "Auditing code..." });

      const projectCode = fileContents.map(f => `### ${path.basename(f.path)} (${f.language})\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');

      const report = await this.auditCode(projectCode, `Project Audit (${uris.length} files)`);

      result = `**Grok 4-Agent Project Audit**\n\nScanned ${uris.length} files.\n\n${report}`;
    });

    return result;
  }

  private async showFixPreview(fixPlan: any, filePath: string): Promise<boolean> {
    let previewText = `**Proposed Changes for ${path.basename(filePath)}**\n\n`;

    if (fixPlan.changes && fixPlan.changes.length > 0) {
      previewText += fixPlan.changes.map((change: any, i: number) => 
        `${i+1}. ${change.description}\n   Reason: ${change.reason}\n`
      ).join('\n');
    } else {
      previewText += "No automatic fixes suggested.";
    }

    const choice = await vscode.window.showInformationMessage(
      `Apply enterprise improvements to ${path.basename(filePath)}?`,
      { modal: true, detail: previewText },
      'Apply Changes',
      'View Report Only'
    );

    return choice === 'Apply Changes';
  }

  private async applyStructuredFixes(changes: any[], filePath: string) {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    let newContent = document.getText();

    for (const change of changes) {
      if (change.oldCode && change.newCode) {
        // Simple string replacement (safe for most cases)
        newContent = newContent.replace(change.oldCode, change.newCode);
      }
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      newContent
    );

    await vscode.workspace.applyEdit(edit);
    await document.save();

    vscode.window.showInformationMessage(`✅ Applied fixes to ${path.basename(filePath)}`);
  }

  private async applyFullRebuild(newCode: string, filePath: string) {
    const uri = vscode.Uri.file(filePath);
    const edit = new vscode.WorkspaceEdit();
    
    // Full file replacement (this is what you want for a real rebuild)
    edit.replace(uri, new vscode.Range(0, 0, 999999, 0), newCode);

    await vscode.workspace.applyEdit(edit);
    await vscode.workspace.openTextDocument(uri).then(doc => doc.save());

    vscode.window.showInformationMessage(`✅ Enterprise rebuild completed on ${path.basename(filePath)}`);
  }

  private async applyMultipleFiles(files: any[], baseDir: string) {
    for (const file of files) {
      const fullPath = path.join(baseDir, file.path);
      const uri = vscode.Uri.file(fullPath);

      // Create or overwrite the file
      await vscode.workspace.fs.writeFile(uri, Buffer.from(file.code, 'utf8'));

      // Open the document to show it in the editor
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    }
  }

  private async showDiffPreview(oldUri: vscode.Uri, newCode: string, title: string) {
    const tempUri = vscode.Uri.parse('untitled:' + title);
    await vscode.workspace.openTextDocument({ content: newCode, language: 'typescript' });
    await vscode.commands.executeCommand('vscode.diff', oldUri, tempUri, title);
  }
}