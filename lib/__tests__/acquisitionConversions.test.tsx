/** @jest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignupPage from '@/app/signup/page';
import ContactSalesPage from '@/app/contact-sales/page';
import { ShopAuditForm } from '@/app/shop-audit/ShopAuditForm';
import { trackEvent } from '@/lib/analytics/track';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/analytics/track', () => ({ trackEvent: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { signUp: jest.fn() } } }));
jest.mock('@/lib/planGate', () => ({ TRIAL_DAYS: 7 }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/components/brand/RedlineD1Logo', () => ({ RedlineD1Logo: () => null }));

const signup = jest.mocked(supabase.auth.signUp);
const track = jest.mocked(trackEvent);
const fetchMock = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  window.localStorage.clear();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
});
afterEach(cleanup);
afterAll(() => { global.fetch = originalFetch; });

function submitSignup() {
  const view = render(<SignupPage />);
  fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Private Name' } });
  fireEvent.change(screen.getByLabelText('Shop Name'), { target: { value: 'Private Shop' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'private@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only-password' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /I agree to the/ }));
  fireEvent.submit(view.container.querySelector('form')!);
  return view;
}

describe('signup conversion', () => {
  it('counts new-account creation once with fixed, non-identifying parameters', async () => {
    signup.mockResolvedValue({ data: { user: { id: 'private-id', identities: [{}] }, session: null }, error: null } as never);
    submitSignup();
    await waitFor(() => expect(screen.getByText('Welcome to RedlineD1')).toBeTruthy());
    expect(track.mock.calls).toEqual([['sign_up', { method: 'email', signup_stage: 'account_created' }]]);
  });

  it('does not count a rejected signup', async () => {
    signup.mockResolvedValue({ data: { user: null, session: null }, error: new Error('Signup rejected') } as never);
    submitSignup();
    await waitFor(() => expect(screen.getByText('Signup rejected')).toBeTruthy());
    expect(track).not.toHaveBeenCalled();
  });

  it.each([[], undefined])('does not count an obfuscated or unconfirmed identity response: %s', async identities => {
    signup.mockResolvedValue({ data: { user: { id: 'existing-user', identities }, session: null }, error: null } as never);
    submitSignup();
    await waitFor(() => expect(screen.getByText('Welcome to RedlineD1')).toBeTruthy());
    expect(track).not.toHaveBeenCalled();
  });
});

describe.each([
  { label: 'contact sales', renderForm: () => render(<ContactSalesPage />), page: 'contact_sales', lead_type: 'sales_inquiry' },
  { label: 'shop audit', renderForm: () => render(<ShopAuditForm />), page: 'shop_audit', lead_type: 'workflow_audit' },
])('$label conversion', ({ renderForm, page, lead_type }) => {
  function submit() {
    const view = renderForm();
    const consent = screen.queryByRole('checkbox');
    if (consent) fireEvent.click(consent);
    fireEvent.submit(view.container.querySelector('form')!);
  }

  it('waits for server acceptance and emits fixed labels', async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValue(new Promise(r => { resolve = r; }));
    submit();
    expect(track).not.toHaveBeenCalled();
    resolve({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track.mock.calls).toEqual([['generate_lead', { page, lead_type }]]);
  });

  it('does not count server rejection', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Request rejected' }) });
    submit();
    await waitFor(() => expect(screen.getByText(/rejected|Failed to send/)).toBeTruthy());
    expect(track).not.toHaveBeenCalled();
  });

  it('does not count network failure', async () => {
    fetchMock.mockRejectedValue(new Error('Network failed'));
    submit();
    await waitFor(() => expect(screen.getByText(/Network failed|could not reach/)).toBeTruthy());
    expect(track).not.toHaveBeenCalled();
  });
});
