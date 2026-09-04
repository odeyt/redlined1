/**
 * @jest-environment jsdom
 */

/**
 * The activation card and the blocked-output dialog, RENDERED.
 *
 * This repo had no component-rendering harness at all — `testEnvironment:
 * 'node'`, no jsdom, no testing library — so every UI assertion in it reads
 * source text. That is how a file that did not parse still passed 3,082 tests
 * earlier in this codebase's history, and it is why the milestone asked for a
 * real render here rather than another grep.
 *
 * The environment is set per-file, so the 3,100-odd existing node tests are
 * untouched.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ShopIdentityCard, canEditShopIdentity } from '../ShopIdentityCard';
import { ShopIdentityBlockedDialog } from '../ShopIdentityBlockedDialog';

describe('the activation card', () => {
  it('names exactly what is missing', () => {
    render(
      <ShopIdentityCard
        missingFields={['address', 'phone']}
        role="owner"
        onOpenSettings={() => {}}
      />,
    );
    expect(screen.getByTestId('shop-identity-card')).toBeTruthy();
    const items = screen.getByTestId('shop-identity-missing').textContent ?? '';
    expect(items).toContain('Business address');
    expect(items).toContain('Telephone number');
    // Not listed, because it is not missing.
    expect(items).not.toContain('Business name');
  });

  it('disappears the moment the profile is complete', () => {
    const { container } = render(
      <ShopIdentityCard missingFields={[]} role="owner" onOpenSettings={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows nothing while the answer is still loading', () => {
    // Otherwise it flashes on every page load for a shop that is fine.
    const { container } = render(
      <ShopIdentityCard
        missingFields={['address']} role="owner" loading onOpenSettings={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('opens the settings form when the owner asks', () => {
    const onOpenSettings = jest.fn();
    render(
      <ShopIdentityCard
        missingFields={['address']} role="owner" onOpenSettings={onOpenSettings} />,
    );
    fireEvent.click(screen.getByText('Complete shop profile'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('never exposes a table or column name', () => {
    const { container } = render(
      <ShopIdentityCard
        missingFields={['businessName', 'address', 'phone']}
        role="owner" onOpenSettings={() => {}} />,
    );
    expect(container.textContent).not.toMatch(/shop_settings|company_name/);
  });

  it('gives the button a thumb-sized target', () => {
    render(
      <ShopIdentityCard missingFields={['address']} role="owner" onOpenSettings={() => {}} />,
    );
    const btn = screen.getByText('Complete shop profile') as HTMLElement;
    expect(btn.style.minHeight).toBe('44px');
  });

  it('wraps rather than forcing a second scroll axis on a phone', () => {
    // It sits above a list that already scrolls.
    render(
      <ShopIdentityCard missingFields={['address']} role="owner" onOpenSettings={() => {}} />,
    );
    expect(screen.getByTestId('shop-identity-card').style.flexWrap).toBe('wrap');
  });
});

describe('who is offered the fix', () => {
  it('an owner can edit shop identity', () => {
    expect(canEditShopIdentity('owner')).toBe(true);
  });

  it('a technician cannot', () => {
    expect(canEditShopIdentity('technician')).toBe(false);
  });

  it('the card is hidden from a technician', () => {
    // A button leading to a screen they cannot open is a dead end.
    const { container } = render(
      <ShopIdentityCard
        missingFields={['address']} role="technician" onOpenSettings={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('is hidden from every role that cannot open settings', () => {
    for (const role of ['technician', 'advisor', 'manager']) {
      const { container } = render(
        <ShopIdentityCard missingFields={['address']} role={role} onOpenSettings={() => {}} />,
      );
      expect(container.innerHTML).toBe('');
    }
  });
});

describe('the blocked-output dialog', () => {
  const base = {
    open: true,
    missingFields: ['address', 'phone'] as const,
    action: 'printed',
    onClose: () => {},
    onOpenSettings: () => {},
  };

  it('explains what was prevented and why', () => {
    render(<ShopIdentityBlockedDialog {...base} role="owner" />);
    const text = screen.getByTestId('shop-identity-blocked').textContent ?? '';
    expect(text).toContain('without your business details');
    expect(text).toContain('not printed');
  });

  it('lists the missing fields', () => {
    render(<ShopIdentityBlockedDialog {...base} role="owner" />);
    const items = screen.getByTestId('shop-identity-blocked-missing').textContent ?? '';
    expect(items).toContain('Business address');
    expect(items).toContain('Telephone number');
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ShopIdentityBlockedDialog {...base} open={false} role="owner" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('offers the owner the repair', () => {
    const onOpenSettings = jest.fn();
    render(<ShopIdentityBlockedDialog {...base} role="owner" onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByText('Complete shop profile'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('APPEARS for a technician, unlike the card, and explains instead', () => {
    // They hit the gate, so they are owed an explanation — but not a button
    // that would fail, and no extra permission.
    render(<ShopIdentityBlockedDialog {...base} role="technician" />);
    expect(screen.getByTestId('shop-identity-blocked')).toBeTruthy();
    expect(screen.getByTestId('shop-identity-blocked-unauthorized').textContent)
      .toContain('An owner needs to complete the shop profile');
    expect(screen.queryByText('Complete shop profile')).toBeNull();
  });

  it('returns the operator to the invoice rather than discarding it', () => {
    const onClose = jest.fn();
    render(<ShopIdentityBlockedDialog {...base} role="owner" onClose={onClose} />);
    fireEvent.click(screen.getByText('Back to the invoice'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is announced to assistive technology', () => {
    render(<ShopIdentityBlockedDialog {...base} role="owner" />);
    const dialog = screen.getByTestId('shop-identity-blocked');
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('shrinks on a phone instead of overflowing the page', () => {
    render(<ShopIdentityBlockedDialog {...base} role="owner" />);
    const dialog = screen.getByTestId('shop-identity-blocked');
    expect(dialog.style.width).toBe('100%');
    expect(dialog.style.maxWidth).toBe('460px');
  });
});
