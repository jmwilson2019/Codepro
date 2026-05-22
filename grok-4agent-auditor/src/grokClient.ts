import OpenAI from 'openai';
import * as vscode from 'vscode';

const SECRET_KEY = 'grok4agent.apiKeys';

/**
 * Pool of Grok clients. Keys are sourced (in order) from:
 *   1. SecretStorage under key "grok4agent.apiKeys" (preferred — set via "Set API Keys" command)
 *   2. Settings property "grok4agent.apiKeys" (legacy, kept for backward compatibility)
 */
export class GrokClientPool {
  private clients: OpenAI[] = [];
  private currentIndex = 0;

  async init(context?: vscode.ExtensionContext): Promise<void> {
    const keys = await GrokClientPool.loadKeys(context);
    if (keys.length === 0) {
      throw new Error(
        'No Grok API keys configured. Run command "Grok 4-Agent: Set API Keys" or add them in Settings (grok4agent.apiKeys).'
      );
    }

    const baseURL = 'https://api.x.ai/v1';
    this.clients = keys.slice(0, 4).map((apiKey) => new OpenAI({ apiKey, baseURL }));
    this.currentIndex = 0;
    console.log(`[GrokClientPool] Initialized with ${this.clients.length} client(s)`);
  }

  static async loadKeys(context?: vscode.ExtensionContext): Promise<string[]> {
    // Prefer SecretStorage
    if (context) {
      const stored = await context.secrets.get(SECRET_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const valid = parsed
              .map((k: unknown) => (typeof k === 'string' ? k.trim() : ''))
              .filter((k: string) => k.startsWith('xai-') && k.length >= 20);
            if (valid.length > 0) {
              return valid;
            }
          }
        } catch {
          // fall through to settings
        }
      }
    }

    // Fallback: settings
    const config = vscode.workspace.getConfiguration('grok4agent');
    const settingsKeys = config.get<string[]>('apiKeys') || [];
    return settingsKeys
      .map((k) => (typeof k === 'string' ? k.trim() : ''))
      .filter((k) => k.startsWith('xai-') && k.length >= 20);
  }

  static async storeKeys(context: vscode.ExtensionContext, keys: string[]): Promise<void> {
    const cleaned = keys
      .map((k) => k.trim())
      .filter((k) => k.startsWith('xai-') && k.length >= 20);
    if (cleaned.length === 0) {
      throw new Error('No valid xAI keys provided (each must start with "xai-" and be at least 20 chars).');
    }
    await context.secrets.store(SECRET_KEY, JSON.stringify(cleaned));
  }

  getAllClients(): OpenAI[] {
    return this.clients;
  }

  getClient(agentIndex: number): OpenAI {
    if (this.clients.length === 0) {
      throw new Error('GrokClientPool not initialised. Call init() first.');
    }
    return this.clients[agentIndex % this.clients.length];
  }

  getNextClient(): OpenAI {
    if (this.clients.length === 0) {
      throw new Error('No Grok clients available. Call init() first.');
    }
    const client = this.clients[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.clients.length;
    return client;
  }

  getClientCount(): number {
    return this.clients.length;
  }
}
