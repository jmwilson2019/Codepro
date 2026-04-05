import OpenAI from 'openai';
import * as vscode from 'vscode';

export class GrokClientPool {
  private clients: OpenAI[] = [];
  private currentIndex = 0;

  // Current strong models (April 2026)
  private models = [
    'grok-4-1-fast-reasoning',           
    'grok-4.20-0309-reasoning',          
    'grok-4.20-0309-reasoning',          
    'grok-4.20-0309-reasoning'           
  ];

  async init() {
    const config = vscode.workspace.getConfiguration('grok4agent');
    const keys = config.get<string[]>('apiKeys') || [];

    if (keys.length === 0) {
      throw new Error('No API keys configured.\n\nPlease add your Grok API keys in VS Code Settings → Extensions → Grok 4-Agent Auditor → "Grok4Agent: Api Keys"');
    }

    // Use up to 4 keys for parallel processing
    const validKeys = keys.filter(key => key?.trim() && key.startsWith('xai-')).slice(0, 4);

    if (validKeys.length === 0) {
      throw new Error('No valid API keys found.\n\nPlease add your Grok API keys (starting with "xai-") in VS Code Settings → Extensions → Grok 4-Agent Auditor → "Grok4Agent: Api Keys"');
    }

    // Create clients for each valid key
    this.clients = validKeys.map(key => new OpenAI({
      apiKey: key.trim(),
      baseURL: 'https://api.x.ai/v1',
    }));

    console.log(`✅ GrokClientPool initialized with ${validKeys.length} key(s) (${this.clients.length} client(s))`);
  }

  getNextClient(): OpenAI {
    if (this.clients.length === 0) throw new Error('No valid xAI clients. Run "Grok 4-Agent: Set API Keys".');
    const client = this.clients[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.clients.length;
    return client;
  }

  getAllClients(): OpenAI[] {
    return this.clients;
  }

  getClientCount(): number {
    return this.clients.length;
  }
}