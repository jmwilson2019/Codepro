import * as vscode from 'vscode';
import { ConsensusReport } from './multiAgentAuditor';

export class TruthPanel {
    private static current: TruthPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposed = false;

    static showOrUpdate(report: ConsensusReport): void {
        if (TruthPanel.current && !TruthPanel.current.disposed) {
            TruthPanel.current.update(report);
            TruthPanel.current.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'grok4agentTruthPanel',
            'Grok 4-Agent · Truth Validation',
            vscode.ViewColumn.Beside,
            { enableScripts: false, retainContextWhenHidden: true }
        );
        TruthPanel.current = new TruthPanel(panel);
        TruthPanel.current.update(report);
    }

    private constructor(panel: vscode.WebviewPanel) {
        this.panel = panel;
        this.panel.onDidDispose(() => {
            this.disposed = true;
            if (TruthPanel.current === this) TruthPanel.current = undefined;
        });
    }

    update(report: ConsensusReport): void {
        this.panel.title = `Grok 4-Agent · ${report.filePath.split(/[\\/]/).pop()}`;
        this.panel.webview.html = this.render(report);
    }

    private render(report: ConsensusReport): string {
        const fileName = report.filePath.split(/[\\/]/).pop() || report.filePath;
        const scoreColor = report.truthScore >= 75 ? '#10b981' : report.truthScore >= 50 ? '#f59e0b' : '#ef4444';
        const wheel = this.renderRomanWheel(report);

        const agentCards = report.verdicts.map((v) => {
            const errBadge = v.error ? `<span class="err">error</span>` : '';
            const findings = v.findings.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
            return `
        <div class="card">
          <div class="card-header">
            <h3>${escapeHtml(v.agent)} ${errBadge}</h3>
            <div class="card-score">${v.score.toFixed(1)} / 10</div>
          </div>
          <div class="card-focus">${escapeHtml(v.focus)}</div>
          <div class="card-conf">Confidence: ${(v.confidence * 100).toFixed(0)}%</div>
          <p>${escapeHtml(v.summary)}</p>
          ${findings ? `<ul>${findings}</ul>` : ''}
        </div>`;
        }).join('');

        return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
  h1 { margin: 0 0 4px 0; }
  .meta { opacity: 0.75; font-size: 12px; margin-bottom: 16px; }
  .scoreband { display:flex; align-items:center; gap:24px; padding:16px; border-radius:8px; background: var(--vscode-editorWidget-background); margin-bottom: 20px; }
  .score-big { font-size: 48px; font-weight: 700; color: ${scoreColor}; line-height: 1; }
  .score-label { font-size: 12px; opacity: 0.7; text-transform: uppercase; letter-spacing: 1px; }
  .agreement { font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
  .card { padding: 12px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); }
  .card-header { display:flex; justify-content:space-between; align-items:center; }
  .card-header h3 { margin: 0; font-size: 16px; }
  .card-score { font-weight: 700; color: ${scoreColor}; }
  .card-focus { font-size: 11px; opacity: 0.65; margin-bottom: 4px; }
  .card-conf { font-size: 11px; opacity: 0.75; margin-bottom: 8px; }
  .err { background:#ef4444; color:white; padding: 1px 6px; border-radius: 4px; font-size: 10px; margin-left: 6px; }
  ul { margin: 4px 0 0 0; padding-left: 18px; }
  li { margin-bottom: 4px; }
  .wheel-wrap { display:flex; justify-content:center; margin: 12px 0 24px 0; }
</style></head><body>
  <h1>Truth Validation</h1>
  <div class="meta">${escapeHtml(fileName)} · ${escapeHtml(report.language)} · ${new Date(report.generatedAt).toLocaleString()}</div>
  <div class="scoreband">
    <div>
      <div class="score-big">${report.truthScore}</div>
      <div class="score-label">Truth Score / 100</div>
    </div>
    <div class="agreement">
      <div><strong>Agreement:</strong> ${(report.agreement * 100).toFixed(0)}%</div>
      <div style="opacity:0.75; font-size:12px;">${escapeHtml(
            report.agreement >= 0.7 ? 'Strong consensus' : report.agreement >= 0.4 ? 'Partial consensus' : 'Council divided'
        )}</div>
    </div>
  </div>
  <div class="wheel-wrap">${wheel}</div>
  <div class="grid">${agentCards}</div>
</body></html>`;
    }

    private renderRomanWheel(report: ConsensusReport): string {
        const size = 260;
        const cx = size / 2;
        const cy = size / 2;
        const r = 100;
        const n = report.verdicts.length;
        if (n === 0) return '';

        const points = report.verdicts.map((v, i) => {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            const radius = (v.score / 10) * r;
            return {
                x: cx + Math.cos(angle) * radius,
                y: cy + Math.sin(angle) * radius,
                labelX: cx + Math.cos(angle) * (r + 18),
                labelY: cy + Math.sin(angle) * (r + 18),
                name: v.agent,
                score: v.score,
            };
        });

        const polygon = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const grid = [0.25, 0.5, 0.75, 1]
            .map((t) => `<circle cx="${cx}" cy="${cy}" r="${(r * t).toFixed(1)}" fill="none" stroke="currentColor" stroke-opacity="0.15" />`)
            .join('');
        const spokes = report.verdicts.map((_, i) => {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.15" />`;
        }).join('');
        const labels = points.map((p) =>
            `<text x="${p.labelX.toFixed(1)}" y="${p.labelY.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="currentColor">${escapeHtml(p.name)}</text>`
        ).join('');
        const dots = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="currentColor" />`).join('');

        return `<svg viewBox="0 0 ${size} ${size + 30}" width="${size}" height="${size + 30}" aria-label="Roman Wheel">
      ${grid}
      ${spokes}
      <polygon points="${polygon}" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-opacity="0.8" stroke-width="1.5" />
      ${dots}
      ${labels}
    </svg>`;
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
