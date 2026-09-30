/**
 * @jest-environment jsdom
 */

/**
 * The trial-tips preference panel is hidden behind the `trial_tips` flag:
 * off, it renders nothing and makes no request (so it cannot show a load
 * error while the trial-tips tables do not exist yet); on, it loads and works.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const flags: Record<string, boolean> = {};
jest.mock('@/components/featureFlags/FeatureFlagProvider', () => ({
  useFeatureFlag: (key: string) => flags[key] ?? false,
}));

const authedFetch = jest.fn();
jest.mock('@/lib/apiClient', () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));

import { TrialTipsPanel } from '../TrialTipsPanel';

const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });

beforeEach(() => {
  for (const k of Object.keys(flags)) delete flags[k];
  authedFetch.mockReset();
});

it('flag off: renders nothing and makes no request', () => {
  const { container } = render(<TrialTipsPanel />);
  expect(container.innerHTML).toBe('');
  expect(authedFetch).not.toHaveBeenCalled();
});

it('flag on: loads the current preference', async () => {
  flags.trial_tips = true;
  authedFetch.mockReturnValueOnce(json({ status: 'unsubscribed' }));
  render(<TrialTipsPanel />);
  expect(await screen.findByText('Off.')).toBeTruthy();
  expect(authedFetch).toHaveBeenCalledWith('/api/trial-tips/preference');
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
});

it('flag on: switching on posts the change and shows the result', async () => {
  flags.trial_tips = true;
  authedFetch
    .mockReturnValueOnce(json({ status: 'none' }))
    .mockReturnValueOnce(json({ status: 'subscribed' }));
  render(<TrialTipsPanel />);
  fireEvent.click(await screen.findByRole('checkbox'));
  await waitFor(() => expect(screen.getByText('Trial tips switched on.')).toBeTruthy());
  expect(authedFetch).toHaveBeenLastCalledWith('/api/trial-tips/preference', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ subscribed: true }),
  }));
});

it('flag on: a suppressed address cannot be switched back on', async () => {
  flags.trial_tips = true;
  authedFetch.mockReturnValueOnce(json({ status: 'suppressed' }));
  render(<TrialTipsPanel />);
  const box = await screen.findByRole('checkbox') as HTMLInputElement;
  expect(box.disabled).toBe(true);
  expect(screen.getByText(/bounced or were reported/)).toBeTruthy();
});
