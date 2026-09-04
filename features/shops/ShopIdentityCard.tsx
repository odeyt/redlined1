'use client';

/**
 * "Complete your shop profile" — shown when a shop cannot issue a document.
 *
 * Six of eight active tenants are in this state. Four have no settings row at
 * all; two have a name but a blank address and telephone. Until now nothing
 * said so: the first sign was an invoice headed "Redlined1" going to their
 * customer, or an email that failed with a database error code.
 *
 * ## Who sees it
 *
 * Only someone who can actually fix it. A technician offered a button that
 * leads to a settings screen they cannot open has been given a dead end, so
 * they are shown nothing here — the blocked-document dialog explains the
 * situation to them at the point it matters instead.
 *
 * Permission is read from the SAME rule the rest of the app uses,
 * `getBlockedModules(role)`, rather than a role list of its own. A second
 * opinion about who may edit settings is how the two drift apart.
 */
import { getBlockedModules } from '@/lib/useShop';
import {
  SHOP_IDENTITY_FIELDS, type ShopIdentityField,
} from '@/lib/shops/shopIdentity';

interface Props {
  missingFields: readonly ShopIdentityField[];
  /** The viewer's role in this shop. Decides whether the fix is offered. */
  role: string;
  /** Opens the existing settings form. The caller keeps the user's place. */
  onOpenSettings: () => void;
  /** Hidden while the answer is still loading, so nothing flashes on load. */
  loading?: boolean;
}

export function canEditShopIdentity(role: string): boolean {
  // Settings is the module that holds shop identity. If a role cannot open
  // it, it cannot fix this, and must not be offered the button.
  return !getBlockedModules(role).includes('settings');
}

export function ShopIdentityCard({ missingFields, role, onOpenSettings, loading }: Props) {
  if (loading) return null;
  if (missingFields.length === 0) return null;
  if (!canEditShopIdentity(role)) return null;

  const labels = SHOP_IDENTITY_FIELDS.filter(f => missingFields.includes(f.key));

  return (
    <div
      data-testid="shop-identity-card"
      role="status"
      style={{
        border: '1px solid rgba(245,158,11,0.5)',
        background: 'rgba(245,158,11,0.10)',
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 16,
        // Wraps rather than scrolling sideways on a phone. This sits above a
        // list that already scrolls; a second axis would be unusable.
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: '#b45309' }}>
          Complete your shop profile
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {/* Names the fields, never a table or column. The operator is
              finishing a profile, not debugging a schema. */}
          Invoices and other customer documents need your{' '}
          <strong style={{ color: 'var(--text)' }}>
            {labels.map(f => f.label.toLowerCase()).join(', ')}
          </strong>
          . Until then they cannot be printed or sent.
        </div>
        <ul
          data-testid="shop-identity-missing"
          style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text)' }}
        >
          {labels.map(f => <li key={f.key}>{f.label}</li>)}
        </ul>
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        style={{
          padding: '10px 16px',
          borderRadius: 999,
          border: '1px solid var(--accent)',
          background: 'var(--accent)',
          color: '#fff',
          fontWeight: 800,
          fontSize: 13,
          // 44, the house minimum for something tapped on a workshop phone.
          minHeight: 44,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Complete shop profile
      </button>
    </div>
  );
}
