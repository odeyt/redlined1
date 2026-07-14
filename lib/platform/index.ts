/**
 * lib/platform/index.ts
 *
 * RedlineD1 Automotive Intelligence Platform — public API surface.
 * Import from here, not from internal engine files directly.
 */

// Core contracts
export type {
  IntelligenceEngine,
  IntelligenceEngineConfig,
  IntelligencePlatformEvent,
  IntelligenceInsight,
  RecommendedAction,
  EngineRegistryEntry,
  PlatformEventType,
  InsightCategory,
  InsightUrgency,
} from './IntelligenceEngine';

// Registry + singleton
export { IntelligenceRegistry, intelligenceRegistry } from './IntelligenceRegistry';

// Engines
export { FleetIntelligenceEngine } from './engines/FleetIntelligenceEngine';
export { PredictiveFailureEngine } from './engines/PredictiveFailureEngine';
export { RepairIntelligenceEngine } from './engines/RepairIntelligenceEngine';
export { TechnicianPerformanceEngine } from './engines/TechnicianPerformanceEngine';
export { VehicleHealthScoreEngine } from './engines/VehicleHealthScoreEngine';
export { PartsIntelligenceEngine } from './engines/PartsIntelligenceEngine';
export { RevenueIntelligenceEngine } from './engines/RevenueIntelligenceEngine';
export { ShopIntelligenceEngine } from './engines/ShopIntelligenceEngine';
export { KnowledgeGraphEngine } from './engines/KnowledgeGraphEngine';

// AI providers
export { AiProviderRegistry, aiProviderRegistry } from './ai/AiProvider';
export type { AiProvider, AiCompletionRequest, AiCompletionResponse, AiProviderName } from './ai/AiProvider';
export { MockAiProvider } from './ai/providers/MockAiProvider';
export { OpenAiProvider } from './ai/providers/OpenAiProvider';
export { AnthropicProvider } from './ai/providers/AnthropicProvider';

// Hardware
export { HardwareRegistry, hardwareRegistry } from './hardware/HardwareProvider';
export type { HardwareProvider, HardwareType, HardwareCapability, HardwareMeasurement } from './hardware/HardwareProvider';

// Self-improving loop
export { SelfImprovingLoop } from './SelfImprovingLoop';
export type { LearningEvent, FeedbackSignal } from './SelfImprovingLoop';
