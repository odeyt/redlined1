/**
 * lib/platform/ai/providers/OpenAiProvider.ts
 *
 * OpenAI provider implementation. Primary reasoning provider for the
 * Diagnostic Orchestrator. Supports structured JSON output via response_format.
 * Never called unless diagnostic_ai_reasoning_enabled flag is true.
 *
 * API key read from OPENAI_API_KEY env var — never exposed to browser.
 */

import type { AiProvider, AiCompletionRequest, AiCompletionResponse } from '../AiProvider';

export class OpenAiProvider implements AiProvider {
  readonly providerId = 'openai' as const;
  readonly defaultModel: string;
  readonly supportsStructuredOutput = true;
  readonly isSimulated = false;

  constructor(modelOverride?: string) {
    this.defaultModel = modelOverride ?? process.env.DIAGNOSTIC_OPENAI_MODEL ?? 'gpt-4o';
  }

  async complete<T = string>(request: AiCompletionRequest): Promise<AiCompletionResponse<T>> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const start = Date.now();
    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0,
    };

    if (request.responseSchema) {
      body['response_format'] = {
        type: 'json_schema',
        json_schema: { name: 'structured_output', strict: true, schema: request.responseSchema },
      };
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    const rawContent = data.choices[0]?.message?.content ?? '';
    const content = request.responseSchema ? JSON.parse(rawContent) : rawContent;

    return {
      content: content as T,
      providerId: this.providerId,
      modelName: data.model,
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
      latencyMs: Date.now() - start,
      isStructured: !!request.responseSchema,
      rawResponse: data,
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!(process.env.OPENAI_API_KEY);
  }
}
