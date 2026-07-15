'use client';

import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import { LegacyDashboardView } from './LegacyDashboardView';
import { NewDashboardView } from './NewDashboardView';

export function DashboardView() {
  const personalDashboard = useFeatureFlag('personal_dashboard');
  if (!personalDashboard) return <LegacyDashboardView />;
  return <NewDashboardView />;
}
