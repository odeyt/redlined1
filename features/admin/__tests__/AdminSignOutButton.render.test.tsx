/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AdminSignOutButton } from '../shared/AdminSignOutButton';

const signOut = jest.fn();
jest.mock('@/lib/auth', () => ({ signOut: () => signOut() }));

const onSignedOut = jest.fn();

beforeEach(() => {
  signOut.mockReset();
  onSignedOut.mockReset();
});

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const clickSignOut = async () => {
  await act(async () => { fireEvent.click(button('Sign out')); });
};

describe('AdminSignOutButton', () => {
  it('ends the session with the shared signOut, and only then leaves the page', async () => {
    signOut.mockResolvedValue(undefined);
    render(<AdminSignOutButton onSignedOut={onSignedOut} />);
    await clickSignOut();
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(onSignedOut.mock.invocationCallOrder[0]);
  });

  it('does not leave the page as if signed out when signing out fails, and says so', async () => {
    signOut.mockRejectedValue(new Error('network'));
    render(<AdminSignOutButton onSignedOut={onSignedOut} />);
    await clickSignOut();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Sign out failed/);
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(button('Sign out').disabled).toBe(false);
  });

  it('ignores a second click while the first sign-out is in flight', async () => {
    let resolve!: () => void;
    signOut.mockReturnValue(new Promise<void>(r => { resolve = r; }));
    render(<AdminSignOutButton onSignedOut={onSignedOut} />);
    await clickSignOut();
    const busy = button('Signing out…');
    expect(busy.disabled).toBe(true);
    await act(async () => { fireEvent.click(busy); });
    expect(signOut).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); });
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
  });
});

describe('every owner-admin page header offers Sign out', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it.each([
    'features/admin/shared/AdminHeader.tsx',
    'features/admin/billing-health/BillingHealthDashboard.tsx',
    'features/admin/sapelee/SapeleeOutboxDashboard.tsx',
  ])('%s renders AdminSignOutButton', (file) => {
    expect(read(file)).toMatch(/<AdminSignOutButton\s*\/>/);
  });

  it('uses the shared lib/auth signOut, not a second sign-out implementation', () => {
    const src = read('features/admin/shared/AdminSignOutButton.tsx');
    expect(src).toMatch(/import \{ signOut \} from '@\/lib\/auth'/);
    expect(src).not.toMatch(/auth\.signOut\(/);
  });

  it('leaves with a full page load of /login, so no owner data stays in memory', () => {
    expect(read('features/admin/shared/AdminSignOutButton.tsx')).toMatch(/window\.location\.assign\('\/login'\)/);
  });
});
