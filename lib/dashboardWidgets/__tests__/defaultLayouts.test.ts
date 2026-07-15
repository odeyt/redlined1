import { DEFAULT_LAYOUTS, getDefaultLayoutForRole } from '../defaultLayouts';
import { WIDGET_REGISTRY } from '../registry';

const REAL_ROLES = ['owner', 'manager', 'advisor', 'technician'];

describe('DEFAULT_LAYOUTS', () => {
  it('has a default layout for all 4 real roles', () => {
    for (const role of REAL_ROLES) {
      expect(DEFAULT_LAYOUTS[role]).toBeDefined();
      expect(DEFAULT_LAYOUTS[role].length).toBeGreaterThan(0);
    }
  });

  it('every widget id in every default layout resolves to a real registry key', () => {
    for (const [role, layout] of Object.entries(DEFAULT_LAYOUTS)) {
      for (const item of layout) {
        expect(WIDGET_REGISTRY[item.i]).toBeDefined();
        if (!WIDGET_REGISTRY[item.i]) continue;
        // and the widget must actually be allowed for that role
        const allowed = WIDGET_REGISTRY[item.i].allowedRoles;
        if (allowed !== null) {
          expect(allowed).toContain(role);
        }
      }
    }
  });
});

describe('getDefaultLayoutForRole', () => {
  it('returns the matching layout for each real role', () => {
    for (const role of REAL_ROLES) {
      expect(getDefaultLayoutForRole(role)).toBe(DEFAULT_LAYOUTS[role]);
    }
  });

  it('falls back to technician for an unknown role string', () => {
    expect(getDefaultLayoutForRole('receptionist')).toBe(DEFAULT_LAYOUTS.technician);
    expect(getDefaultLayoutForRole('')).toBe(DEFAULT_LAYOUTS.technician);
  });
});
