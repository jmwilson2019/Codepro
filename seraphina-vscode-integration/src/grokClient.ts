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

  async init(context: vscode.ExtensionContext) {
    const stored = await context.secrets.get('grok4agent.apiKeys');

    if (!stored) {
      throw new Error('No API key found.\n\nPlease run command:\n"Grok4Agent: Set API Keys"');
    }

    let keys: string[] = JSON.parse(stored);

    // Take the first key (we're using only 1 for now)
    const apiKey = keys[0]?.trim();

    if (!apiKey || !apiKey.startsWith('xai-')) {
      throw new Error('Invalid or expired API key.\n\nPlease run "Grok4Agent: Set API Keys" again with a fresh key from https://console.x.ai');
    }

    // Create 1 client
    this.clients = [new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.x.ai/v1',
    })];

    console.log(`✅ GrokClientPool initialized with 1 key (1 client)`);
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