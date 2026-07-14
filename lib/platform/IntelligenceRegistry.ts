/**
 * lib/platform/IntelligenceRegistry.ts
 *
 * Plugin registry for the RedlineD1 Automotive Intelligence Platform.
 * Engines self-register at startup. The bus routes events to all enabled engines.
 * Adding a new engine requires: (1) implement IntelligenceEngine, (2) register here.
 */

import type {
  IntelligenceEngine,
  IntelligencePlatformEvent,
  IntelligenceInsight,
  EngineRegistryEntry,
  PlatformEventType,
} from './IntelligenceEngine';

export class IntelligenceRegistry {
  private readonly engines = new Map<string, EngineRegistryEntry>();

  register(engine: IntelligenceEngine): void {
    if (this.engines.has(engine.config.engineId)) {
      throw new Error(`Engine already registered: ${engine.config.engineId}`);
    }
    this.engines.set(engine.config.engineId, {
      engine,
      isEnabled: false,   // enabled after flag check at runtime
      totalEventsProcessed: 0,
      totalInsightsGenerated: 0,
      errorCount: 0,
    });
  }

  enable(engineId: string): void {
    const entry = this.engines.get(engineId);
    if (entry) entry.isEnabled = true;
  }

  disable(engineId: string): void {
    const entry = this.engines.get(engineId);
    if (entry) entry.isEnabled = false;
  }

  getEntry(engineId: string): EngineRegistryEntry | undefined {
    return this.engines.get(engineId);
  }

  listEngines(): EngineRegistryEntry[] {
    return Array.from(this.engines.values());
  }

  /** Returns all engines subscribed to a given event type that are currently enabled */
  getSubscribersForEvent(eventType: PlatformEventType): IntelligenceEngine[] {
    const result: IntelligenceEngine[] = [];
    for (const entry of this.engines.values()) {
      if (entry.isEnabled && entry.engine.config.subscribedEvents.includes(eventType)) {
        result.push(entry.engine);
      }
    }
    return result;
  }

  /** Route an event to all subscribed enabled engines, collect all insights */
  async dispatch(
    event: IntelligencePlatformEvent,
  ): Promise<{ engineId: string; insights: IntelligenceInsight[] }[]> {
    const subscribers = this.getSubscribersForEvent(event.eventType);
    const results = await Promise.allSettled(
      subscribers.map(async (engine) => {
        const entry = this.engines.get(engine.config.engineId)!;
        try {
          const insights = await engine.process(event, event.shopId) as IntelligenceInsight[];
          entry.totalEventsProcessed++;
          entry.totalInsightsGenerated += insights.length;
          entry.lastProcessedAt = new Date().toISOString();
          return { engineId: engine.config.engineId, insights };
        } catch (err) {
          entry.errorCount++;
          console.error(`[IntelligenceRegistry] Engine ${engine.config.engineId} failed:`, err);
          return { engineId: engine.config.engineId, insights: [] };
        }
      }),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<{ engineId: string; insights: IntelligenceInsight[] }> => r.status === 'fulfilled')
      .map((r) => r.value);
  }
}

// Singleton registry — imported by the event bus and API routes
export const intelligenceRegistry = new IntelligenceRegistry();
