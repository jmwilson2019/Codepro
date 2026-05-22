import * as vscode from 'vscode';
import { MultiAgentAuditor } from './multiAgentAuditor';

let auditor: MultiAgentAuditor | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Grok Auditor: Activating extension...');

  try {
    auditor = new MultiAgentAuditor();
    console.log('Grok Auditor: Auditor initialized successfully');
  } catch (err) {
    console.error('Grok Auditor: Failed to init auditor:', err);
    vscode.window.showErrorMessage(`Init failed: ${(err as Error).message}`);
  }

  try {
    context.subscriptions.push(
      vscode.commands.registerCommand('grok4agent.auditCurrentFile', async () => {
        console.log('Grok Auditor: Command invoked');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No active file open.');
          return;
        }
        const code = editor.document.getText();
        const filePath = editor.document.fileName;
        console.log(`Grok Auditor: Auditing file ${filePath} (${code.length} chars)`);
        await runAudit(code, filePath, false);
      })
    );
    console.log('Grok Auditor: Command registered successfully');
  } catch (err) {
    console.error('Grok Auditor: Failed to register command:', err);
    vscode.window.showErrorMessage(`Registration failed: ${(err as Error).message}`);
  }

  console.log('Grok Auditor: Extension activated successfully');
  vscode.window.showInformationMessage('Grok 4-Agent Auditor ready ✨ Click the sparkle icon in the title bar.');
}

async function runAudit(code: string, filePath: string, isProject: boolean) {
  if (!auditor) {
    vscode.window.showErrorMessage('Auditor not initialized. Reload extension.');
    return;
  }
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Running 4 Grok Agents...",
    cancellable: true
  }, async () => {
    try {
      const result = await auditor!.auditCode(code, filePath, isProject);
      const { suggestions, synthesis, file } = result;

      const panel = vscode.window.createWebviewPanel(
        'grokAuditPanel',
        'Audit Report',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      // Separate read-only report and actionable suggestions
      const reportHtml = suggestions.map((s, idx) => `
        <div class="report-section">
          <h2>${s.agent} Agent</h2>
          <div style="margin-bottom: 0.5em; white-space: pre-wrap;">${s.explanation.replace(/\n/g, '<br>')}</div>
          ${s.code ? `<pre class="code-snippet" data-idx="${idx}" style="background:#181818; border-radius:6px; padding:12px; position: relative; cursor: pointer;">${escapeHtml(s.code)}</pre>` : ''}
        </div>
      `).join('');

      const actionableSuggestions = suggestions.map((s, origIdx) => {
        if (!s.code) return '';
        return `
        <div class="suggestion-block">
          <div class="suggestion-content">
            <div class="action-header">
              <strong>${s.agent}:</strong> ${s.explanation.substring(0, 100)}...
            </div>
            <pre class="action-code">${escapeHtml(s.code!)}</pre>
          </div>
          <div class="suggestion-actions">
            <button class="copy-btn" data-idx="${origIdx}">Copy</button>
            <button class="apply-btn" data-idx="${origIdx}">Apply</button>
            <button class="ignore-btn" data-idx="${origIdx}">Ignore</button>
          </div>
        </div>
        `;
      }).filter(Boolean).join('');

      panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
          <style>
            /* Action panel styles */
            .action-panel { pointer-events: auto; z-index: 100; }
            .action-item { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 1em; margin-bottom: 1em; background: var(--vscode-widget-shadow); }
            .action-header { font-weight: bold; margin-bottom: 0.5em; }
            .action-code { background: #181818; border-radius: 4px; padding: 0.8em; font-size: 0.9em; max-height: 15em; overflow: auto; white-space: pre; }
            .action-buttons { display: flex; gap: 0.5em; justify-content: flex-end; }
            .copy-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); min-width: 90px; }\n            .apply-btn, .ignore-btn {\n              padding: 7px 18px;\n              border: none;\n              border-radius: 4px;\n              font-size: 13px;\n              cursor: pointer;\n              min-width: 90px;\n            }\n            .apply-btn {\n              background: var(--vscode-button-background);\n              color: var(--vscode-button-foreground);\n            }\n            .apply-btn:hover:not(:disabled) {\n              background: var(--vscode-button-hoverBackground);\n              transform: translateY(-1px);\n            }\n            .ignore-btn {\n              background: var(--vscode-button-secondaryBackground);\n              color: var(--vscode-button-secondaryForeground);\n            }\n            .ignore-btn:hover:not(:disabled) {\n              background: var(--vscode-button-secondaryHoverBackground);\n            }\n            #global-action-bar button {\n              padding: 10px 24px;\n              font-size: 14px;\n              font-weight: 500;\n            }
            .report-section { margin-bottom: 1.5em; padding: 1em; border-left: 3px solid var(--vscode-textLink-foreground); background: var(--vscode-editorHoverHighlightBackground); }
            .code-snippet { cursor: copy !important; transition: background 0.2s; }
            .code-snippet:hover { background: #282828 !important; }
            body { display: flex; flex-direction: column; height: 100vh; font-family: system-ui; padding: 20px; background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, #ddd); }
            h1 { color: var(--vscode-editor-foreground, #fff); }
            .suggestion-block {
              border: 1px solid var(--vscode-widget-border);
              border-radius: 6px;
              margin-bottom: 16px;
              background: var(--vscode-editor-background);
              display: flex;
              flex-direction: column;
            }
            .suggestion-content {
              padding: 12px;
              flex: 1;
            }
            .suggestion-actions {
              border-top: 1px solid var(--vscode-panel-border);
              padding: 10px 12px;
              background: var(--vscode-editor-background);
              display: flex;
              gap: 10px;
              justify-content: flex-end;
              position: sticky;
              bottom: 0;
              z-index: 5;
            }
            .button-group {
              display: flex;
              gap: 8px;
              justify-content: flex-end;
              margin-top: 4px;
            }
            .apply-btn, .ignore-btn {
              padding: 6px 14px;
              border: none;
              border-radius: 4px;
              font-size: 13px;
              cursor: pointer;
              min-width: 80px;
            }
            .apply-btn {
              background: var(--vscode-button-background, #2e8b57);
              color: var(--vscode-button-foreground, #fff);
            }
            .apply-btn:hover {
              background: var(--vscode-button-hoverBackground, #246b47);
            }
            .ignore-btn {
              background: var(--vscode-button-secondaryBackground, #8b2e2e);
              color: var(--vscode-button-secondaryForeground, #fff);
            }
            .ignore-btn:hover {
              background: var(--vscode-button-secondaryHoverBackground, #a33e3e);
            }
            .apply-btn:disabled, .ignore-btn:disabled {
              opacity: 0.6;
              cursor: not-allowed;
            }
          </style>
        </head>
        <body>
          <h1>4-Agent Audit Report</h1>
          <div><b>File:</b> ${file}</div>
          <div id="suggestions-container" style="flex: 1; overflow-y: auto; padding: 12px; padding-bottom: 90px; margin: 1.5em 0;">
            ${reportHtml}
            <div style="margin: 2em 0 1.5em 0;">
              <h3 style="margin-top: 0;">🛠️ Actionable Suggestions (<span id="suggestion-count">${suggestions.filter(s => s.code).length}</span> with code)</h3>
              ${actionableSuggestions || '<p style="color: var(--vscode-descriptionForeground);">No suggestions with code blocks found. <em>Buttons disabled until code is available.</em></p>'}
            </div>
            <div class="synthesis-section">
              <h2>Final Synthesis</h2>
              <div style="white-space: pre-wrap;">${synthesis}</div>
            </div>
          </div>
          <div id="global-action-bar" style="position: fixed; bottom: 0; left: 0; right: 0; height: 68px; background: var(--vscode-editor-background); border-top: 2px solid var(--vscode-focusBorder); display: flex; align-items: center; justify-content: center; gap: 16px; padding: 0 20px; z-index: 1000; box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);">
            <button id="apply-all-btn">Apply All (Full Edit Proceed)</button>
            <button id="ignore-all-btn">Ignore All</button>
          </div>
          <script>
            const vscode = acquireVsCodeApi();
            // Handle clicks on report code snippets, action panel buttons, and copy
      document.addEventListener('click', function(e) {
        const target = e.target;
        const btn = target.closest('button');
        const codeSnippet = target.closest('.code-snippet');
        if (btn) {
          const idx = btn.getAttribute('data-idx');
          console.log('Button clicked:', btn.className, 'idx:', idx);
          if (btn.classList.contains('apply-btn') || btn.classList.contains('copy-btn')) {
            if (idx !== null) {
              const msgIdx = Number(idx);
              console.log('Per-suggestion button clicked:', btn.className, 'idx:', msgIdx);
              if (btn.classList.contains('copy-btn')) {
                vscode.postMessage({ type: 'copy', idx: msgIdx });
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = 'Copy', 2000);
              } else {
                vscode.postMessage({ type: 'apply', idx: msgIdx });
                btn.disabled = true;
                btn.textContent = 'Applied ✓';
              }
              // Disable sibling buttons
              const group = btn.closest('.action-buttons, .button-group');
              if (group) group.querySelectorAll('button').forEach(b => b.disabled = true);
            }
          } else if (btn.classList.contains('ignore-btn')) {
            btn.disabled = true;
            btn.textContent = 'Ignored';
            const group = btn.closest('.action-buttons, .button-group');
            if (group) group.querySelectorAll('button').forEach(b => b.disabled = true);
            const block = btn.closest('.suggestion-block');
            if (block) {
              block.style.opacity = '0.6';
              block.style.pointerEvents = 'none';
            }
          } else if (btn.id === 'apply-all-btn') {
            console.log('Global apply-all clicked');
            vscode.postMessage({ type: 'applyAll' });
            btn.disabled = true;
            btn.textContent = 'Applied All ✓';
          } else if (btn.id === 'ignore-all-btn') {
            console.log('Global ignore-all clicked');
            vscode.postMessage({ type: 'ignoreAll' });
            btn.disabled = true;
            btn.textContent = 'Ignored All';
          }
        } else if (codeSnippet) {
          const idx = codeSnippet.getAttribute('data-idx');
          if (idx !== null) {
            navigator.clipboard.writeText(codeSnippet.textContent!).then(() => {
              console.log('Report code copied:', idx);
            });
          }
        }
      }, true); // Capture phase for reliability
            function escapeHtml(str) {
              return str.replace(/[&<>"']/g, function(m) {
                return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]);
              });
            }
          </script>
        </body>
        </html>`;

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'apply') {
          console.log(`[Extension] Received apply for idx: ${msg.idx} suggestions.length: ${suggestions.length}`);
          if (msg.idx >= 0 && msg.idx < suggestions.length) {
            const suggestion = suggestions[msg.idx];
            if (suggestion?.code) {
              const editor = vscode.window.activeTextEditor;
              if (editor && editor.document.fileName === filePath) {
                await editor.edit(editBuilder => {
                  editBuilder.replace(new vscode.Range(0, 0, editor.document.lineCount, 0), suggestion.code!);
                });
                vscode.window.showInformationMessage(`Applied suggestion ${msg.idx}.`);
              } else {
                console.warn('[Extension] No active editor or wrong file');
              }
            } else {
              console.warn('No code in suggestion:', msg.idx);
            }
          } else {
            console.warn('[Extension] Invalid suggestion index');
          }
        } else if (msg.type === 'applyAll') {
          console.log('[Extension] Apply all requested');
          const actionable = suggestions.filter(s => s.code);
          if (actionable.length === 0) {
            vscode.window.showInformationMessage('No actionable suggestions to apply.');
            return;
          }
          const lastSuggestion = actionable[actionable.length - 1];
          const editor = vscode.window.activeTextEditor;
          if (editor && editor.document.fileName === filePath) {
            await editor.edit(editBuilder => {
              editBuilder.replace(new vscode.Range(0, 0, editor.document.lineCount, 0), lastSuggestion.code!);
            });
            vscode.window.showInformationMessage(`Applied all suggestions (final: ${lastSuggestion.agent}).`);
          } else {
            vscode.window.showWarningMessage('Active file changed.');
          }
        } else if (msg.type === 'ignoreAll') {
          console.log('[Extension] All ignored');
        } else if (msg.type === 'copy') {
          console.log('[Extension] Copy requested for idx:', msg.idx);
          if (typeof msg.idx === 'number' && msg.idx >= 0 && msg.idx < suggestions.length && suggestions[msg.idx]?.code) {
            vscode.env.clipboard.writeText(suggestions[msg.idx].code!);
            vscode.window.showInformationMessage('Code copied to clipboard!');
          } else {
            vscode.window.showWarningMessage('Invalid copy index.');
          }
        }
      });
    } catch (err: any) {
      vscode.window.showErrorMessage(`Audit failed: ${err.message}`);
    }
  });
}

function escapeHtml(str: string) {
  return str.replace(/[&<>"']/g, function (m) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' } as Record<string, string>)[m] || m;
  });
}

export function deactivate() { }