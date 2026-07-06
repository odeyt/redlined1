'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { FlagMap, KnownFlagKey } from '@/lib/featureFlags/types';

// ── Context ───────────────────────────────────────────────────────────────────

interface FeatureFlagContextValue {
  flags: FlagMap;
  loading: boolean;
  refresh: () => void;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  flags: {},
  loading: true,
  refresh: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FlagMap>({});
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    try {
      const res = await fetch('/api/feature-flags', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { flags: FlagMap };
      setFlags(data.flags ?? {});
    } catch {
      // Fail open — never crash the app over flag fetch
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  return (
    <FeatureFlagContext.Provider value={{ flags, loading, refresh: fetchFlags }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the evaluated boolean for a feature flag.
 * Defaults to false while loading or if the flag is missing.
 *
 * @example
 * const smartIntake = useFeatureFlag('smart_intake');
 * if (!smartIntake) return null;
 */
export function useFeatureFlag(key: KnownFlagKey | string): boolean {
  const { flags } = useContext(FeatureFlagContext);
  return flags[key] ?? false;
}

/** Returns all evaluated flags and loading state. */
export function useFeatureFlags(): FeatureFlagContextValue {
  return useContext(FeatureFlagContext);
}

// ── Gate ─────────────────────────────────────────────────────────────────────

interface FeatureGateProps {
  flag: KnownFlagKey | string;
  children: React.ReactNode;
  /** Optional fallback rendered when flag is disabled. */
  fallback?: React.ReactNode;
}

/**
 * Renders children only when the named feature flag is enabled.
 *
 * @example
 * <FeatureGate flag="smart_intake">
 *   <SmartIntakePanel />
 * </FeatureGate>
 */
export function FeatureGate({ flag, children, fallback = null }: FeatureGateProps) {
  const { flags, loading } = useContext(FeatureFlagContext);
  if (loading) return null;
  return (flags[flag] ?? false) ? <>{children}</> : <>{fallback}</>;
}
