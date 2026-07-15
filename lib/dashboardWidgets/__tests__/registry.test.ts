import { WIDGET_REGISTRY, getWidgetsForRole } from '../registry';

describe('WIDGET_REGISTRY', () => {
  it('every entry has an id matching its registry key', () => {
    for (const [key, def] of Object.entries(WIDGET_REGISTRY)) {
      expect(def.id).toBe(key);
    }
  });
});

describe('getWidgetsForRole', () => {
  it('excludes role-restricted widgets for a role not in allowedRoles', () => {
    const technicianWidgets = getWidgetsForRole('technician', new Set());
    const ids = technicianWidgets.map(w => w.id);
    expect(ids).not.toContain('revenue-kpi-row'); // owner/manager only
    expect(ids).toContain('operational-kpi-row'); // allowedRoles: null
  });

  it('includes role-restricted widgets for an allowed role', () => {
    const ownerWidgets = getWidgetsForRole('owner', new Set());
    expect(ownerWidgets.map(w => w.id)).toContain('revenue-kpi-row');
  });

  it('excludes flag-gated widgets when the flag is not enabled', () => {
    const ownerWidgets = getWidgetsForRole('owner', new Set());
    expect(ownerWidgets.map(w => w.id)).not.toContain('ai-copilot-placeholder');
  });

  it('includes flag-gated widgets once the required flag is enabled', () => {
    const ownerWidgets = getWidgetsForRole('owner', new Set(['dashboard_widget_placeholders']));
    expect(ownerWidgets.map(w => w.id)).toContain('ai-copilot-placeholder');
  });

  it('never returns widgets requiring a flag for an unrelated role, even with the flag on', () => {
    // fleet-health-placeholder is owner/manager only
    const technicianWidgets = getWidgetsForRole('technician', new Set(['dashboard_widget_placeholders']));
    expect(technicianWidgets.map(w => w.id)).not.toContain('fleet-health-placeholder');
  });
});
