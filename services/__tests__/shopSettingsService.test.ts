const SHOP_A = '11111111-1111-4111-8111-111111111111';

const mockMaybeSingle = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
jest.mock('@/lib/shopStore', () => ({
  getShopId: () => SHOP_A,
  getShopIds: () => [SHOP_A],
}));

import { fetchShopSettings } from '../shopSettingsService';

beforeEach(() => {
  mockFrom.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();
  mockMaybeSingle.mockReset();
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
});

describe('fetchShopSettings — column allowlist', () => {
  it('never selects messaging_settings — the removed secret-bearing jsonb column', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await fetchShopSettings();
    expect(mockSelect).toHaveBeenCalledTimes(1);
    const selectArg = mockSelect.mock.calls[0][0] as string;
    expect(selectArg).not.toMatch(/messaging_settings/);
    expect(selectArg).not.toBe('*');
  });

  it('explicitly selects an allowlist of known-safe, non-secret columns', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await fetchShopSettings();
    const selectArg = mockSelect.mock.calls[0][0] as string;
    for (const col of [
      'company_name', 'tagline', 'logo_url', 'address', 'phone', 'email', 'website',
      'hidden_modules', 'role_permissions', 'labor_rate', 'default_tax_rate',
      'invoice_prefix', 'estimate_prefix', 'business_type', 'service_types',
      'enabled_payment_methods', 'inspection_template',
      'enable_time_tracking', 'enable_job_archive', 'enable_vehicle_photos', 'enable_vehicle_edit',
      'enable_technician_report', 'enable_job_completion_report',
      'enable_appointment_bay', 'appointment_bays',
      'enable_job_card_priority', 'enable_job_card_branch_route',
      'enable_job_card_service_location', 'enable_job_card_approval_code',
      'enable_job_card_sub_type', 'service_sub_types',
    ]) {
      expect(selectArg).toContain(col);
    }
  });

  it('the returned ShopSettings object carries no messaging field, even if the row has stale messaging_settings data', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { company_name: 'Test Shop', messaging_settings: { twilioToken: 'still-in-the-db-but-must-not-surface' } },
      error: null,
    });
    const settings = await fetchShopSettings();
    expect(settings).not.toHaveProperty('messaging');
    expect(JSON.stringify(settings)).not.toContain('still-in-the-db-but-must-not-surface');
  });
});
