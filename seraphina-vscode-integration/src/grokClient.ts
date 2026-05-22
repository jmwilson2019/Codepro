import OpenAI from 'openai';
import * as vscode from 'vscode';

const SECRET_KEY = 'seraphina.apiKeys';
// Backwards compat: read legacy storage key from older builds
const LEGACY_SECRET_KEY = 'grok4agent.apiKeys';

export class GrokClientPool {
  private clients: OpenAI[] = [];
  private currentIndex = 0;

  async init(context: vscode.ExtensionContext): Promise<void> {
    const keys = await GrokClientPool.loadKeys(context);
    if (keys.length === 0) {
      throw new Error(
        'No Grok API keys configured.\n\nRun command "Seraphina: Set Grok API Keys" and paste 1-4 keys from https://console.x.ai'
      );
    }

    this.clients = keys.map(
      (apiKey) =>
        new OpenAI({
          apiKey,
          baseURL: 'https://api.x.ai/v1',
        })
    );
    this.currentIndex = 0;
    console.log(`Seraphina: GrokClientPool initialized with ${this.clients.length} client(s)`);
  }

  static async loadKeys(context: vscode.ExtensionContext): Promise<string[]> {
    let stored = await context.secrets.get(SECRET_KEY);
    if (!stored) {
      stored = await context.secrets.get(LEGACY_SECRET_KEY);
      if (stored) {
        // Migrate
        await context.secrets.store(SECRET_KEY, stored);
        await context.secrets.delete(LEGACY_SECRET_KEY);
      }
    }
    if (!stored) {
      return [];
    }
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((k: unknown) => (typeof k === 'string' ? k.trim() : ''))
        .filter((k: string) => k.startsWith('xai-') && k.length >= 20);
    } catch {
      return [];
    }
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

  /** Get a client by agent index (deterministic, round-robins through configured keys). */
  getClient(agentIndex: number): OpenAI {
    if (this.clients.length === 0) {
      throw new Error('GrokClientPool not initialised. Call init() first.');
    }
    return this.clients[agentIndex % this.clients.length];
  }

  getNextClient(): OpenAI {
    if (this.clients.length === 0) {
      throw new Error('GrokClientPool not initialised.');
    }
    const client = this.clients[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.clients.length;
    return client;
  }

  getClientCount(): number {
    return this.clients.length;
  }
}
