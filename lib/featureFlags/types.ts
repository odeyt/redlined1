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
  | 'recommendation_outcomes';
