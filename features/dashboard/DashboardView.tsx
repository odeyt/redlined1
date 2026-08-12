'use client';

import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import { LegacyDashboardView } from './LegacyDashboardView';
import { NewDashboardView } from './NewDashboardView';
import { RoleQuickActions } from './shared/RoleQuickActions';

export function DashboardView() {
  const personalDashboard = useFeatureFlag('personal_dashboard');
  // Above both variants on purpose. Whichever dashboard the flag selects, the
  // top of the screen is the role's own shortcuts, rendered from local data
  // so they are there before any widget finishes loading. Placing this in the
  // wrapper means neither variant can drift out of having it.
  return (
    <>
      <RoleQuickActions />
      {personalDashboard ? <NewDashboardView /> : <LegacyDashboardView />}
    </>
  );
}
