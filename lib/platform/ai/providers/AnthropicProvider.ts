/**
 * lib/platform/ai/providers/AnthropicProvider.ts
 *
 * Anthropic Claude provider. Independent review provider for the Diagnostic Orchestrator.
 * Never called unless diagnostic_claude_review_enabled flag is true.
 * Also used as secondary provider for general AI features.
 *
 * API key read from ANTHROPIC_API_KEY env var — never exposed to browser.
 */

import type { AiProvider, AiCompletionRequest, AiCompletionResponse } from '../AiProvider';

export class AnthropicProvider implements AiProvider {
  readonly providerId = 'anthropic' as const;
  readonly defaultModel: string;
  readonly supportsStructuredOutput = true;
  readonly isSimulated = false;

  constructor(modelOverride?: string) {
    this.defaultModel = modelOverride ?? process.env.DIAGNOSTIC_CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001';
  }

  async complete<T = string>(request: AiCompletionRequest): Promise<AiCompletionResponse<T>> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

    const start = Date.now();

    // Extract system message
    const systemMsg = request.messages.find((m) => m.role === 'system');
    const userMessages = request.messages.filter((m) => m.role !== 'system');

    // For structured output, append JSON schema instruction to system prompt
    const systemPrompt = systemMsg?.content ?? '';
    const structuredInstruction = request.responseSchema
      ? `\n\nRespond ONLY with valid JSON matching this schema: ${JSON.stringify(request.responseSchema)}`
      : '';

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0,
      system: systemPrompt + structuredInstruction,
      messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
      model: string;
    };

    const rawContent = data.content.find((c) => c.type === 'text')?.text ?? '';
    const content = request.responseSchema ? JSON.parse(rawContent) : rawContent;

    return {
      content: content as T,
      providerId: this.providerId,
      modelName: data.model,
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      latencyMs: Date.now() - start,
      isStructured: !!request.responseSchema,
      rawResponse: data,
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!(process.env.ANTHROPIC_API_KEY);
  }
}
