/**
 * @jest-environment jsdom
 */

/**
 * Settings → Feature Flags, RENDERED against a mocked API.
 *
 * The screen told every owner "Owner access required" because neither it nor
 * the flag provider sent the active shop, so the server looked up the
 * caller's role in shop ''. These hold the fix: the shop goes with every flag
 * request, an owner sees and can toggle the flags, and the provider
 * re-evaluates when the active shop is set.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

let mockShopId = 'shop-1';
jest.mock('@/lib/shopStore', () => ({ getShopId: () => mockShopId }));

import { FeatureFlagsPanel } from '../FeatureFlagsPanel';
import { FeatureFlagProvider, useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function headerOf(init: RequestInit, name: string): string | undefined {
  const h = init.headers as Record<string, string> | undefined;
  return h?.[name];
}

function mockFetch(respond: (url: string, init: RequestInit) => unknown) {
  global.fetch = jest.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => respond(String(url), init) } as Response;
  }) as typeof fetch;
}

const ROW = {
  id: 'f1', flag_key: 'intent_intake', display_name: 'intent_intake', description: 'Intake', enabled: true,
  scope: 'global', shop_id: null, user_id: null, role: null, environment: null,
  created_at: '2026-09-26T00:00:00Z', updated_at: '2026-09-26T04:15:54Z',
};

beforeEach(() => {
  calls = [];
  mockShopId = 'shop-1';
});

describe('FeatureFlagsPanel', () => {
  it('sends the active shop and lists the flags for an owner', async () => {
    mockFetch(() => ({ flags: {}, rows: [ROW] }));
    render(<FeatureFlagsPanel />);

    expect(await screen.findByRole('button', { name: 'Disable intent_intake' })).toBeTruthy();
    expect(screen.queryByText(/Owner access required/)).toBeNull();
    expect(headerOf(calls[0].init, 'x-shop-id')).toBe('shop-1');
  });

  it('sends the active shop with a toggle', async () => {
    mockFetch((url) => url.includes('/api/feature-flags/') ? { ok: true } : { flags: {}, rows: [ROW] });
    render(<FeatureFlagsPanel />);
    await screen.findByRole('button', { name: 'Disable intent_intake' });

    fireEvent.click(screen.getByRole('button', { name: 'Disable intent_intake' }));

    await waitFor(() => expect(calls.some(c => c.init.method === 'PATCH')).toBe(true));
    const patch = calls.find(c => c.init.method === 'PATCH')!;
    expect(headerOf(patch.init, 'x-shop-id')).toBe('shop-1');
    expect(headerOf(patch.init, 'Content-Type')).toBe('application/json');
  });

  it('shows a failed toggle next to the switch, with the server\'s reason', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      if (init.method === 'PATCH') {
        return { ok: false, json: async () => ({ error: 'database unavailable' }) } as Response;
      }
      return { ok: true, json: async () => ({ flags: {}, rows: [ROW] }) } as Response;
    }) as typeof fetch;
    render(<FeatureFlagsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disable intent_intake' }));

    // Beside the switch — the panel-level message is at the top of a long list.
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Not saved — try again')).toBeTruthy();
    expect(screen.getByText(/Could not change intent_intake: database unavailable/)).toBeTruthy();
    // Unchanged: still shown as enabled.
    expect(screen.getByRole('button', { name: 'Disable intent_intake' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('still says so when the caller is not an owner of this shop', async () => {
    mockFetch(() => ({ flags: {} }));
    render(<FeatureFlagsPanel />);
    expect(await screen.findByText(/Owner access required/)).toBeTruthy();
  });

  it('says there is no active shop instead of blaming the role', async () => {
    mockShopId = '';
    mockFetch(() => ({ flags: {}, rows: [ROW] }));
    render(<FeatureFlagsPanel />);
    expect(await screen.findByText(/No active shop yet/)).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

describe('FeatureFlagProvider', () => {
  function Probe() {
    return <span>{useFeatureFlag('intent_intake') ? 'on' : 'off'}</span>;
  }

  it('evaluates flags for the active shop, and again when the shop is set', async () => {
    mockShopId = '';
    mockFetch(() => ({ flags: { intent_intake: mockShopId === 'shop-1' } }));
    render(<FeatureFlagProvider><Probe /></FeatureFlagProvider>);

    expect(await screen.findByText('off')).toBeTruthy();
    expect(headerOf(calls[0].init, 'x-shop-id')).toBeUndefined();

    // First login: the shop is resolved after the app loaded.
    mockShopId = 'shop-1';
    act(() => { window.dispatchEvent(new CustomEvent('active-shop-changed', { detail: { shopId: 'shop-1' } })); });

    expect(await screen.findByText('on')).toBeTruthy();
    expect(headerOf(calls[calls.length - 1].init, 'x-shop-id')).toBe('shop-1');
  });
});
