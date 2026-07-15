export type FlagScope = 'global' | 'shop' | 'role' | 'user' | 'environment';
export type FlagRole = 'owner' | 'manager' | 'technician' | 'advisor';
export type FlagEnvironment = 'production' | 'staging' | 'development';

export interface FeatureFlag {
  id: string;
  flag_key: string;
  display_name: string;
  description: string;
  enabled: boolean;
  scope: FlagScope;
  shop_id: string | null;
  user_id: string | null;
  role: FlagRole | null;
  environment: FlagEnvironment | null;
  created_at: string;
  updated_at: string;
}

export interface FlagEvaluationContext {
  userId: string;
  shopId: string;
  role: FlagRole | string;
  environment: FlagEnvironment;
}

/** Evaluated result: key → enabled */
export type FlagMap = Record<string, boolean>;

/** All known flag keys as a union for type safety */
export type KnownFlagKey =
  | 'smart_intake'
  | 'ai_estimates'
  | 'ai_service_advisor'
  | 'knowledge_graph'
  | 'similar_repairs'
  | 'ai_second_opinion'
  | 'voice_notes'
  | 'owner_dashboard_v2'
  | 'mobile_beta'
  | 'plugin_system'
  // Intelligence Foundation — all default OFF
  | 'intelligence_foundation'
  | 'intelligence_bus'
  | 'recommendation_engine'
  | 'command_center'
  | 'daily_summary'
  | 'morning_briefing'
  | 'daily_recommendations'
  // SI-4: Live Intelligence Pipeline
  | 'live_intelligence_pipeline'
  | 'shop_metrics'
  | 'command_center_live_data'
  // SI-5: Evidence Engine
  | 'evidence_engine'
  | 'actionable_recommendations'
  | 'recommendation_outcomes'
  // Diagnostic Orchestrator — all default OFF
  | 'diagnostic_orchestrator_enabled'
  | 'diagnostic_bridge_enabled'
  | 'diagnostic_ai_reasoning_enabled'
  | 'diagnostic_claude_review_enabled'
  | 'diagnostic_live_hardware_enabled'
  // Intelligence Platform Engines — all default OFF
  | 'fleet_intelligence_enabled'
  | 'predictive_failure_enabled'
  | 'repair_intelligence_enabled'
  | 'technician_performance_enabled'
  | 'vehicle_health_score_enabled'
  | 'customer_intelligence_enabled'
  | 'parts_intelligence_enabled'
  | 'revenue_intelligence_enabled'
  | 'shop_intelligence_enabled'
  | 'knowledge_graph_engine_enabled'
  // AI Provider flags — all default OFF
  | 'ai_provider_openai_enabled'
  | 'ai_provider_anthropic_enabled'
  | 'ai_provider_gemini_enabled'
  // Personal Dashboard / Widget System — all default OFF
  | 'personal_dashboard'
  | 'widget_system'
  | 'command_center_operational_metrics'
  | 'dashboard_widget_placeholders';
