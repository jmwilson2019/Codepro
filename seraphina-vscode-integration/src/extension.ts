import * as vscode from 'vscode';
import { MultiAgentAuditor } from './multiAgentAuditor';

let auditor: MultiAgentAuditor;

async function setApiKeys(context: vscode.ExtensionContext) {
  // Clear any old keys first
  await context.secrets.delete('grok4agent.apiKeys');

  const key = await vscode.window.showInputBox({
    title: "Enter xAI Grok API Key",
    prompt: "Paste your xAI API key (must start with xai-)",
    password: true,
    ignoreFocusOut: true,
    validateInput: (text) => {
      const trimmed = text?.trim();
      if (!trimmed) return "API key is required";
      if (!trimmed.startsWith("xai-")) return 'Key must start with "xai-"';
      if (trimmed.length < 20) return "Key looks too short";
      return null;
    }
  });

  if (key === undefined) {
    vscode.window.showErrorMessage("Key setup cancelled.");
    return;
  }

  const trimmedKey = key.trim();
  await context.secrets.store('grok4agent.apiKeys', JSON.stringify([trimmedKey]));

  vscode.window.showInformationMessage('✅ API key saved successfully! You can now run the audit.');
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Activating Grok 4-Agent Auditor...');
  auditor = new MultiAgentAuditor(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('grok4agent.auditCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const code = editor.document.getText();
      const filePath = editor.document.fileName;

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Running 4-Agent Grok Audit...",
        cancellable: true
      }, async () => {
        try {
          const report = await auditor.auditCode(code, filePath);
          const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
          await vscode.window.showTextDocument(doc);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Audit failed: ${err.message}`);
        }
      });
    }),

    vscode.commands.registerCommand('grok4agent.auditProject', async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Running 4-Agent Project Audit...",
        cancellable: true
      }, async () => {
        try {
          const report = await auditor.auditProject();
          const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
          await vscode.window.showTextDocument(doc);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Project audit failed: ${err.message}`);
        }
      });
    }),

    vscode.commands.registerCommand('grok4agent.openPanel', () => {
      vscode.window.showInformationMessage('4-Agent Auditor Panel coming in next iteration (webview)');
    }),
    vscode.commands.registerCommand('grok4agent.setApiKeys', async () => {
      await setApiKeys(context);
    })
  );

  console.log('Grok 4-Agent Auditor activated successfully.');
  vscode.window.showInformationMessage('Grok 4-Agent Auditor activated. Use Ctrl+Shift+P for commands.');
}

export function deactivate() {}