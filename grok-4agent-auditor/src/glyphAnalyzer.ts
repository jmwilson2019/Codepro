import * as vscode from 'vscode';
import * as path from 'path';
import { GrokClientPool } from './grokClient';

export interface GlyphFinding {
    glyph: string;
    pattern: string;
    count: number;
    meaning: string;
}

export interface GlyphReport {
    filePath: string;
    language: string;
    metrics: {
        lines: number;
        nonBlankLines: number;
        commentRatio: number;
        longestLine: number;
        todoCount: number;
        asyncCount: number;
        tryCount: number;
    };
    glyphs: GlyphFinding[];
    insight: string;
}

/** Glyph analysis = lightweight static pass + optional Grok narrative. */
export class GlyphAnalyzer {
    private pool: GrokClientPool;

    constructor(private context: vscode.ExtensionContext) {
        this.pool = new GrokClientPool();
    }

    async analyze(code: string, filePath: string, languageId?: string): Promise<GlyphReport> {
        const lines = code.split(/\r?\n/);
        const nonBlank = lines.filter((l) => l.trim().length > 0);
        const commentLines = lines.filter((l) => /^\s*(\/\/|#|--|\*)/.test(l));
        const longestLine = lines.reduce((m, l) => Math.max(m, l.length), 0);

        const glyphs: GlyphFinding[] = [];
        const pushGlyph = (glyph: string, pattern: string, meaning: string) => {
            const re = new RegExp(pattern, 'g');
            const count = (code.match(re) || []).length;
            if (count > 0) glyphs.push({ glyph, pattern, count, meaning });
        };

        pushGlyph('⟳', '\\b(for|while|forEach)\\b', 'iteration / loop');
        pushGlyph('⟁', '\\b(if|else|switch|case)\\b', 'branching / decision');
        pushGlyph('⌬', '\\b(async|await|Promise|then|catch)\\b', 'asynchronous flow');
        pushGlyph('☍', '\\b(try|catch|finally|throw|raise|except)\\b', 'error handling');
        pushGlyph('✦', '\\b(class|interface|struct|trait|impl)\\b', 'type / abstraction');
        pushGlyph('⌖', '\\b(function|def|fn|fun|func|=>)\\b', 'function definition');
        pushGlyph('☉', '\\b(import|require|use|from|include)\\b', 'module boundary');
        pushGlyph('⚑', '\\bTODO\\b|\\bFIXME\\b|\\bHACK\\b|\\bXXX\\b', 'flag / unfinished work');
        pushGlyph('☷', '\\b(fetch|axios|request|http|https|grpc)\\b', 'network IO');
        pushGlyph('⌘', '\\b(read|write|open|close|fs\\.|os\\.)\\b', 'filesystem / OS IO');

        const todoCount = glyphs.find((g) => g.glyph === '⚑')?.count ?? 0;
        const asyncCount = glyphs.find((g) => g.glyph === '⌬')?.count ?? 0;
        const tryCount = glyphs.find((g) => g.glyph === '☍')?.count ?? 0;

        const metrics: GlyphReport['metrics'] = {
            lines: lines.length,
            nonBlankLines: nonBlank.length,
            commentRatio: nonBlank.length === 0 ? 0 : commentLines.length / nonBlank.length,
            longestLine,
            todoCount,
            asyncCount,
            tryCount,
        };

        const language = languageId || path.extname(filePath).replace('.', '') || 'plaintext';
        const insight = await this.narrate(metrics, glyphs, filePath, language).catch(
            (err: unknown) => `Narrative unavailable: ${err instanceof Error ? err.message : String(err)}`
        );

        return { filePath, language, metrics, glyphs, insight };
    }

    private async narrate(
        metrics: GlyphReport['metrics'],
        glyphs: GlyphFinding[],
        filePath: string,
        language: string
    ): Promise<string> {
        try {
            await this.pool.init(this.context);
        } catch {
            return `(No API key configured — static glyph analysis only.)`;
        }

        const client = this.pool.getClient(0) as any;
        const model = vscode.workspace.getConfiguration('grok4agent').get<string>('model', 'grok-4');
        const summary = glyphs.map((g) => `${g.glyph} ${g.meaning}: ${g.count}`).join('\n');

        const prompt = `You are the Glyph Interpreter. Given the static metrics and glyph pattern counts below for a ${language} file, write 3 short paragraphs (no bullet lists, no headings) describing:
1. What this file is shaped like architecturally.
2. Where its risks or pressure points likely are.
3. One concrete first improvement.

Be concise and specific. Do NOT invent details about code you cannot see — only reason from the metrics.

File: ${path.basename(filePath)}

Metrics:
- Lines: ${metrics.lines} (non-blank ${metrics.nonBlankLines})
- Comment ratio: ${(metrics.commentRatio * 100).toFixed(1)}%
- Longest line: ${metrics.longestLine} chars
- TODO/FIXME flags: ${metrics.todoCount}
- Async tokens: ${metrics.asyncCount}
- try/catch tokens: ${metrics.tryCount}

Glyphs detected:
${summary || '(none)'}`;

        const response = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 700,
        });

        return response.choices[0]?.message?.content?.trim() ?? '(empty response)';
    }
}
