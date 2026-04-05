import * as vscode from 'vscode';
import { MultiAgentAuditor } from './multiAgentAuditor';

let auditor: MultiAgentAuditor;

export function activate(context: vscode.ExtensionContext) {
  auditor = new MultiAgentAuditor();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('grok4agent.auditCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active file open.');
        return;
      }
      const code = editor.document.getText();
      const filePath = editor.document.fileName;
      await runAudit(code, filePath, false, "Auditing current file with 4 Grok agents...");
    }),

    vscode.commands.registerCommand('grok4agent.auditProject', async () => {
      await runAudit("", "", true, "Scanning entire project with 4 Grok agents...");
    })
  );

  // Register Activity Bar Sidebar
  const provider = new GrokAuditorViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('grokSidebar', provider)
  );

  vscode.window.showInformationMessage('Grok 4-Agent Auditor loaded. Click the sparkle icon in the Activity Bar.');
}

// Webview Provider for the Sidebar
class GrokAuditorViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            padding: 20px;
            background-color: #1e1e1e;
            color: #cccccc;
            margin: 0;
          }
          h2 {
            color: #ffffff;
            margin-bottom: 20px;
          }
          button {
            width: 100%;
            padding: 14px 16px;
            margin: 10px 0;
            font-size: 15px;
            background-color: #007acc;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
          }
          button:hover {
            background-color: #0066b3;
          }
          p {
            color: #aaaaaa;
            font-size: 13px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <h2>🚀 Grok 4-Agent Auditor</h2>
        <p>Select an audit type:</p>

        <button onclick="auditCurrent()">Audit Current File</button>
        <button onclick="auditProject()">Audit Entire Project</button>

        <script>
          const vscode = acquireVsCodeApi();

          function auditCurrent() {
            vscode.postMessage({ command: 'auditCurrentFile' });
          }

          function auditProject() {
            vscode.postMessage({ command: 'auditProject' });
          }
        </script>
      </body>
      </html>`;

    // Handle messages from sidebar buttons
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'auditCurrentFile') {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No active file open.');
          return;
        }
        const code = editor.document.getText();
        const filePath = editor.document.fileName;
        await runAudit(code, filePath, false, "Auditing current file with 4 Grok agents...");
      }
      else if (message.command === 'auditProject') {
        await runAudit("", "", true, "Scanning entire project with 4 Grok agents...");
      }
    });
  }
}

async function runAudit(code: string, filePath: string, isProject: boolean, title: string) {
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: title,
    cancellable: true
  }, async () => {
    try {
      const report = await auditor.auditCode(code, filePath, isProject);

      const doc = await vscode.workspace.openTextDocument({
        content: report,
        language: 'markdown'
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err: any) {
      vscode.window.showErrorMessage(`Audit failed: ${err.message}`);
    }
  });
}

export function deactivate() {}