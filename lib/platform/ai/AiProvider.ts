/**
 * lib/platform/ai/AiProvider.ts
 *
 * Multi-model AI provider abstraction for the RedlineD1 platform.
 * Supported providers: OpenAI, Anthropic Claude, Gemini, Local LLM.
 * No provider-specific logic leaks into business logic.
 * The orchestrator and all engines call this interface — never providers directly.
 *
 * Provider selection: environment variable AI_PROVIDER or per-call override.
 * Fallback chain: primary → secondary → mock (never fails silently).
 */

// ── Message types ──────────────────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant';

export interface AiMessage {
  role: MessageRole;
  content: string;
}

// ── Request / response ─────────────────────────────────────────────────────────

export interface AiCompletionRequest {
  messages: AiMessage[];
  /** JSON schema for structured output — provider handles tool/JSON mode internally */
  responseSchema?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;          // 0–2; defaults to 0 for structured output
  /** Caller-readable label for logging/observability — never sent to provider */
  taskLabel: string;
  /** Override provider for this call — falls back to session default */
  providerOverride?: AiProviderName;
}

export interface AiCompletionResponse<T = string> {
  content: T;
  providerId: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  isStructured: boolean;
  /** Raw response preserved for audit — never returned to browser client */
  rawResponse?: unknown;
}

// ── Provider names ─────────────────────────────────────────────────────────────

export type AiProviderName =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'local_llm'
  | 'mock';

// ── Provider interface ─────────────────────────────────────────────────────────

export interface AiProvider {
  readonly providerId: AiProviderName;
  readonly defaultModel: string;
  readonly supportsStructuredOutput: boolean;
  readonly isSimulated: boolean;

  complete<T = string>(request: AiCompletionRequest): Promise<AiCompletionResponse<T>>;
  isAvailable(): Promise<boolean>;
}

// ── Provider registry ──────────────────────────────────────────────────────────

export class AiProviderRegistry {
  private readonly providers = new Map<AiProviderName, AiProvider>();
  private primaryProvider: AiProviderName = 'mock';
  private fallbackProvider: AiProviderName = 'mock';

  register(provider: AiProvider): void {
    this.providers.set(provider.providerId, provider);
  }

  setPrimary(name: AiProviderName): void { this.primaryProvider = name; }
  setFallback(name: AiProviderName): void { this.fallbackProvider = name; }

  get(name: AiProviderName): AiProvider | undefined {
    return this.providers.get(name);
  }

  async complete<T = string>(request: AiCompletionRequest): Promise<AiCompletionResponse<T>> {
    const providerName = request.providerOverride ?? this.primaryProvider;
    const primary = this.providers.get(providerName);

    if (primary && await primary.isAvailable()) {
      try {
        return await primary.complete<T>(request);
      } catch (err) {
        console.warn(`[AiProviderRegistry] Primary provider ${providerName} failed, trying fallback:`, err);
      }
    }

    const fallback = this.providers.get(this.fallbackProvider);
    if (fallback) return await fallback.complete<T>(request);

    throw new Error(`[AiProviderRegistry] No available AI provider for task: ${request.taskLabel}`);
  }
}

export const aiProviderRegistry = new AiProviderRegistry();
