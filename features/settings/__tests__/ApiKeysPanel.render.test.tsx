/**
 * @jest-environment jsdom
 */

/**
 * Settings → API Keys and the "Created by API" badge, rendered (PLAN.md
 * phase 6).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let flagOn = true;
jest.mock('@/components/featureFlags/FeatureFlagProvider', () => ({ useFeatureFlag: () => flagOn }));

const fetchMock = jest.fn();
jest.mock('@/lib/apiClient', () => ({
  authedFetch: (...args: unknown[]) => fetchMock(...args),
  apiErrorMessage: async (_r: Response, fallback: string) => fallback,
}));

import { ApiKeysPanel } from '../ApiKeysPanel';
import { CreatedByApiBadge } from '@/components/CreatedByApiBadge';
import { mapEstimateRow } from '@/lib/domain/estimates';
import { mapInvoiceRow } from '@/lib/domain/invoiceMath';

const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const KEY = {
  id: 'k1', name: 'Wally Bot', prefix: 'rl_live_ab12cd34', scopes: ['estimates:read'], allShops: false,
  createdAt: '2026-11-20T00:00:00Z', lastUsedAt: null, revokedAt: null,
  activity: [{ action: 'estimate.created', entityType: 'estimate', entityId: 'EST-0011', at: '2026-11-21T00:00:00Z' }],
};

beforeEach(() => {
  flagOn = true;
  fetchMock.mockReset();
});

describe('who sees the panel', () => {
  it('renders nothing, and asks for nothing, while the flag is off', () => {
    flagOn = false;
    const { container } = render(<ApiKeysPanel shopId="s1" role="owner" />);
    expect(container.innerHTML).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['manager', 'advisor', 'technician', ''])('renders nothing for %s', role => {
    const { container } = render(<ApiKeysPanel shopId="s1" role={role} />);
    expect(container.innerHTML).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('for the owner', () => {
  it('lists keys with their recent activity', async () => {
    fetchMock.mockResolvedValueOnce(ok({ keys: [KEY] }));
    render(<ApiKeysPanel shopId="s1" role="owner" />);
    expect(await screen.findByText('Wally Bot')).toBeTruthy();
    expect(screen.getByText(/created estimate EST-0011/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/api-keys?shopId=s1');
  });

  it('shows the secret once after issuing, then lets it go', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ keys: [] }))
      .mockResolvedValueOnce(ok({ key: { ...KEY, name: 'CRM' }, secret: 'rl_live_SECRET' }, 201))
      .mockResolvedValueOnce(ok({ keys: [KEY] }));
    render(<ApiKeysPanel shopId="s1" role="owner" />);
    await screen.findByText('No active keys.');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CRM' } });
    fireEvent.click(screen.getByText('Read + write drafts'));
    fireEvent.click(screen.getByText('Issue key'));

    expect((await screen.findByTestId('api-key-secret')).textContent).toBe('rl_live_SECRET');
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent).toMatchObject({ shopId: 's1', name: 'CRM' });
    expect(sent.scopes).toEqual(expect.arrayContaining(['estimates:write', 'invoices:write', 'pdf:read']));

    fireEvent.click(screen.getByText('I have stored it'));
    await waitFor(() => expect(screen.queryByTestId('api-key-secret')).toBeNull());
  });

  it('asks before revoking, and does nothing if the owner cancels', async () => {
    fetchMock.mockResolvedValueOnce(ok({ keys: [KEY] }));
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ApiKeysPanel shopId="s1" role="owner" />);
    fireEvent.click(await screen.findByText('Revoke'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/stops working immediately/));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('offers no revoke button for an organization-wide key', async () => {
    fetchMock.mockResolvedValueOnce(ok({ keys: [{ ...KEY, allShops: true }] }));
    render(<ApiKeysPanel shopId="s1" role="owner" />);
    await screen.findByText('Wally Bot');
    expect(screen.queryByText('Revoke')).toBeNull();
    expect(screen.getByText('ALL SHOPS')).toBeTruthy();
  });
});

describe('Created by API badge', () => {
  it('shows only for documents an API key made', () => {
    expect(render(<CreatedByApiBadge createdVia="api" />).container.textContent).toBe('CREATED BY API');
    expect(render(<CreatedByApiBadge />).container.innerHTML).toBe('');
  });

  it('the mappers mark API-made rows and nothing else', () => {
    expect(mapEstimateRow({ id: 'e', created_via: 'api' }).createdVia).toBe('api');
    expect(mapEstimateRow({ id: 'e' })).not.toHaveProperty('createdVia');
    expect(mapInvoiceRow({ number: 'INV-1', created_via: 'api' }).createdVia).toBe('api');
    expect(mapInvoiceRow({ number: 'INV-1', created_via: 'ui' })).not.toHaveProperty('createdVia');
  });

  it('is on the estimate and invoice lists and detail headers', () => {
    for (const [f, list, detail] of [
      ['features/estimates/EstimatesView.tsx', 'est.createdVia', 'selected.createdVia'],
      ['features/invoices/InvoicesView.tsx', 'inv.createdVia', 'selected.createdVia'],
    ]) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      expect(src).toContain(`<CreatedByApiBadge createdVia={${list}} />`);
      expect(src).toContain(`<CreatedByApiBadge createdVia={${detail}} />`);
    }
  });
});
