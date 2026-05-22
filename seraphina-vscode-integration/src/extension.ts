import * as vscode from 'vscode';
import { MultiAgentAuditor, ConsensusReport } from './multiAgentAuditor';
import { GlyphAnalyzer } from './glyphAnalyzer';
import { GrokClientPool } from './grokClient';
import { TruthPanel } from './truthPanel';

let auditor: MultiAgentAuditor;
let glyphAnalyzer: GlyphAnalyzer;
let lastReport: ConsensusReport | undefined;

async function setApiKeysFlow(context: vscode.ExtensionContext): Promise<void> {
  const collected: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const key = await vscode.window.showInputBox({
      title: `Seraphina · Grok API Key ${i} of up to 4`,
      prompt:
        i === 1
          ? 'Paste your xAI API key (must start with "xai-"). You can add up to 4 keys.'
          : `Paste key ${i}, or leave blank to finish.`,
      password: true,
      ignoreFocusOut: true,
      validateInput: (text) => {
        const t = text?.trim() ?? '';
        if (t === '' && i > 1) {
          return null; // allow blank to finish
        }
        if (!t) {
          return 'API key is required';
        }
        if (!t.startsWith('xai-')) {
          return 'Key must start with "xai-"';
        }
        if (t.length < 20) {
          return 'Key looks too short';
        }
        return null;
      },
    });
    if (key === undefined) {
      vscode.window.showWarningMessage('Seraphina: key setup cancelled.');
      return;
    }
    const trimmed = key.trim();
    if (trimmed === '') {
      break;
    }
    collected.push(trimmed);
  }
  if (collected.length === 0) {
    vscode.window.showErrorMessage('Seraphina: no keys provided.');
    return;
  }
  try {
    await GrokClientPool.storeKeys(context, collected);
    vscode.window.showInformationMessage(
      `Seraphina: stored ${collected.length} key${collected.length === 1 ? '' : 's'} securely.`
    );
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Seraphina: failed to store keys — ${m}`);
  }
}

async function ensureKeys(context: vscode.ExtensionContext): Promise<boolean> {
  const keys = await GrokClientPool.loadKeys(context);
  if (keys.length > 0) {
    return true;
  }
  const choice = await vscode.window.showInformationMessage(
    'Seraphina has no Grok API keys configured. Set them now?',
    'Set Keys',
    'Cancel'
  );
  if (choice === 'Set Keys') {
    await setApiKeysFlow(context);
    const after = await GrokClientPool.loadKeys(context);
    return after.length > 0;
  }
  return false;
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('Seraphina VSCode Integration: activating');
  auditor = new MultiAgentAuditor(context);
  glyphAnalyzer = new GlyphAnalyzer(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('seraphina.setApiKeys', () => setApiKeysFlow(context)),

    vscode.commands.registerCommand('seraphina.auditWithConsensus', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Seraphina: no active editor.');
        return;
      }
      if (!(await ensureKeys(context))) {
        return;
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Seraphina · Roman Wheel Consensus',
          cancellable: false,
        },
        async (progress) => {
          try {
            const code = editor.document.getText();
            const report = await auditor.auditWithConsensus(
              code,
              editor.document.fileName,
              editor.document.languageId,
              (msg) => progress.report({ message: msg })
            );
            lastReport = report;
            TruthPanel.showOrUpdate(report, context.extensionUri);
            const doc = await vscode.workspace.openTextDocument({
              content: report.synthesis,
              language: 'markdown',
            });
            await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Active });
          } catch (err: unknown) {
            const m = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Seraphina: audit failed — ${m}`);
          }
        }
      );
    }),

    vscode.commands.registerCommand('seraphina.glyphAnalysis', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Seraphina: no active editor.');
        return;
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Seraphina · Glyph Analysis',
          cancellable: false,
        },
        async () => {
          try {
            const code = editor.document.getText();
            const report = await glyphAnalyzer.analyze(
              code,
              editor.document.fileName,
              editor.document.languageId
            );
            const md = renderGlyphMarkdown(report);
            const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
            await vscode.window.showTextDocument(doc, { preview: false });
          } catch (err: unknown) {
            const m = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Seraphina: glyph analysis failed — ${m}`);
          }
        }
      );
    }),

    vscode.commands.registerCommand('seraphina.openTruthPanel', async () => {
      if (lastReport) {
        TruthPanel.showOrUpdate(lastReport, context.extensionUri);
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        'No consensus report yet. Run Roman Wheel audit on the current file?',
        'Run Audit',
        'Cancel'
      );
      if (choice === 'Run Audit') {
        await vscode.commands.executeCommand('seraphina.auditWithConsensus');
      }
    })
  );

  console.log('Seraphina VSCode Integration: activated');
}

export function deactivate(): void {
  // nothing to clean up
}

function renderGlyphMarkdown(r: import('./glyphAnalyzer').GlyphReport): string {
  const lines: string[] = [];
  lines.push(`# Seraphina · Glyph Analysis`);
  lines.push('');
  lines.push(`**File:** \`${r.filePath}\``);
  lines.push(`**Language:** ${r.language}`);
  lines.push('');
  lines.push('## Metrics');
  lines.push(`- Lines: ${r.metrics.lines} (non-blank ${r.metrics.nonBlankLines})`);
  lines.push(`- Comment ratio: ${(r.metrics.commentRatio * 100).toFixed(1)}%`);
  lines.push(`- Longest line: ${r.metrics.longestLine}`);
  lines.push(`- TODO / FIXME flags: ${r.metrics.todoCount}`);
  lines.push(`- Async tokens: ${r.metrics.asyncCount}`);
  lines.push(`- try/catch tokens: ${r.metrics.tryCount}`);
  lines.push('');
  lines.push('## Glyphs Detected');
  if (r.glyphs.length === 0) {
    lines.push('(none)');
  } else {
    lines.push('| Glyph | Meaning | Count |');
    lines.push('|------|---------|-------|');
    for (const g of r.glyphs) {
      lines.push(`| ${g.glyph} | ${g.meaning} | ${g.count} |`);
    }
  }
  lines.push('');
  lines.push('## Interpreter');
  lines.push('');
  lines.push(r.insight);
  return lines.join('\n');
}
