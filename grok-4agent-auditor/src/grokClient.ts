import * as vscode from 'vscode';
import OpenAI from 'openai';

export class GrokClientPool {
  private clients: OpenAI[] = [];

  async init(): Promise<void> {
    const config = vscode.workspace.getConfiguration('grok4agent');
    const keys = config.get<string[]>('apiKeys') || [];

    if (keys.length === 0) {
      throw new Error('Configure at least 1 Grok API key in settings.');
    }

    const baseURL = 'https://api.x.ai/v1';

    this.clients = keys.slice(0, 4).map(key => 
      new OpenAI({
        apiKey: key.trim(),
        baseURL
      })
    );

    console.log(`[GrokClientPool] Initialized with ${this.clients.length} clients`);
  }

  getAllClients(): OpenAI[] {
    return this.clients;
  }

  getNextClient(): OpenAI {
    if (this.clients.length === 0) {
      throw new Error('No Grok clients available. Call init() first.');
    }
    // Simple round-robin
    const index = Math.floor(Math.random() * this.clients.length);
    return this.clients[index];
  }
}