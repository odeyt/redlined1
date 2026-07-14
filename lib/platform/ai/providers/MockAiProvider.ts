/**
 * lib/platform/ai/providers/MockAiProvider.ts
 *
 * Deterministic mock AI provider — always available, never calls external APIs.
 * Used in tests and when all real providers are disabled via feature flags.
 */

import type { AiProvider, AiCompletionRequest, AiCompletionResponse } from '../AiProvider';

export class MockAiProvider implements AiProvider {
  readonly providerId = 'mock' as const;
  readonly defaultModel = 'mock-v1';
  readonly supportsStructuredOutput = true;
  readonly isSimulated = true;

  async complete<T = string>(request: AiCompletionRequest): Promise<AiCompletionResponse<T>> {
    const start = Date.now();
    const mockContent = request.responseSchema
      ? this.buildMockStructuredResponse(request.responseSchema)
      : `[MOCK] Response to: ${request.taskLabel}`;

    return {
      content: mockContent as T,
      providerId: this.providerId,
      modelName: this.defaultModel,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: Date.now() - start,
      isStructured: !!request.responseSchema,
    };
  }

  private buildMockStructuredResponse(schema: Record<string, unknown>): unknown {
    // Generate a minimal valid object from the schema's required properties
    const props = (schema['properties'] as Record<string, { type?: string }>) ?? {};
    const result: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(props)) {
      if (def.type === 'string') result[key] = `[mock_${key}]`;
      else if (def.type === 'number') result[key] = 0;
      else if (def.type === 'boolean') result[key] = false;
      else if (def.type === 'array') result[key] = [];
      else result[key] = null;
    }
    return result;
  }

  async isAvailable(): Promise<boolean> { return true; }
}
