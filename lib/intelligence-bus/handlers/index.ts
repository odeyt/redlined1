/**
 * lib/intelligence-bus/handlers/index.ts
 *
 * Registers all RIB handlers onto the bus singleton.
 * Call initializeRibHandlers() once at application startup (e.g. in the
 * RIB API route or in a Next.js instrumentation.ts file).
 *
 * Each handler is only registered when its feature flag is enabled.
 * The bus remains the source of truth — adding a new handler here
 * is the only file change required to wire a new module.
 */

import type { RibEventBus } from '../bus';
import { registerDiagnosticOrchestratorHandler } from './diagnostic-orchestrator.handler';
import { registerAiCopilotHandler } from './ai-copilot.handler';
import { registerFleetIntelligenceHandler } from './fleet-intelligence.handler';
import { registerPredictiveFailureHandler } from './predictive-failure.handler';
import { registerVehicleHealthHandler } from './vehicle-health.handler';
import { registerTechnicianIntelligenceHandler } from './technician-intelligence.handler';
import { registerRevenueIntelligenceHandler } from './revenue-intelligence.handler';
import type { RibSubscription } from '../subscriber';

export interface RibHandlerFlags {
  diagnostic_orchestrator_enabled: boolean;
  ai_copilot_enabled?: boolean;
  fleet_intelligence_enabled: boolean;
  predictive_failure_enabled: boolean;
  vehicle_health_score_enabled: boolean;
  technician_performance_enabled: boolean;
  revenue_intelligence_enabled: boolean;
}

let registrations: RibSubscription[] = [];

/**
 * Register all enabled handlers. Safe to call multiple times —
 * existing registrations are torn down first so flags take effect.
 */
export function initializeRibHandlers(bus: RibEventBus, flags: RibHandlerFlags): void {
  // Tear down existing registrations so flag changes take effect
  for (const sub of registrations) {
    sub.unsubscribe();
  }
  registrations = [];

  if (flags.diagnostic_orchestrator_enabled) {
    registrations.push(registerDiagnosticOrchestratorHandler(bus));
  }
  if (flags.ai_copilot_enabled) {
    registrations.push(registerAiCopilotHandler(bus));
  }
  if (flags.fleet_intelligence_enabled) {
    registrations.push(registerFleetIntelligenceHandler(bus));
  }
  if (flags.predictive_failure_enabled) {
    registrations.push(registerPredictiveFailureHandler(bus));
  }
  if (flags.vehicle_health_score_enabled) {
    registrations.push(registerVehicleHealthHandler(bus));
  }
  if (flags.technician_performance_enabled) {
    registrations.push(registerTechnicianIntelligenceHandler(bus));
  }
  if (flags.revenue_intelligence_enabled) {
    registrations.push(registerRevenueIntelligenceHandler(bus));
  }

  console.log('[RIB] handlers initialized', { count: registrations.length });
}

/** List currently active subscriber IDs */
export function activeSubscriberIds(): string[] {
  return registrations.map((s) => s.subscriberId);
}
