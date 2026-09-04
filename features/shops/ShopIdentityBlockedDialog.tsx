'use client';

/**
 * Shown instead of producing a document the shop cannot legitimately issue.
 *
 * Unlike the activation card, this appears for EVERY role. A technician who
 * presses Print has hit the gate and is owed an explanation — telling them
 * nothing, or failing silently, is what this milestone exists to end. They are
 * told an owner has to finish the profile; they are not given a button that
 * would take them to a screen they cannot open.
 *
 * The invoice underneath is untouched. Nothing is saved, altered or discarded
 * by opening this — the document simply was not produced.
 */
import { canEditShopIdentity } from './ShopIdentityCard';
import {
  SHOP_IDENTITY_FIELDS, type ShopIdentityField,
} from '@/lib/shops/shopIdentity';

interface Props {
  open: boolean;
  missingFields: readonly ShopIdentityField[];
  role: string;
  /** What the operator was trying to do, e.g. "print this invoice". */
  action: string;
  onClose: () => void;
  /** Only called for a role that can actually edit settings. */
  onOpenSettings: () => void;
}

export function ShopIdentityBlockedDialog({
  open, missingFields, role, action, onClose, onOpenSettings,
}: Props) {
  if (!open) return null;

  const labels = SHOP_IDENTITY_FIELDS.filter(f => missingFields.includes(f.key));
  const canFix = canEditShopIdentity(role);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        data-testid="shop-identity-blocked"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="shop-identity-blocked-title"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          padding: 24,
          // Shrinks on a phone rather than forcing the page sideways.
          width: '100%', maxWidth: 460,
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        }}
      >
        <div id="shop-identity-blocked-title" style={{ fontWeight: 800, fontSize: 16 }}>
          Add your shop details first
        </div>

        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
          {/* Says what would have gone wrong, not merely that it stopped. A
              document with no business name on it is worse than no document,
              and the operator deserves to know that is what was prevented. */}
          This document would go out without your business details on it, so it
          was not {action}.
        </p>

        <ul
          data-testid="shop-identity-blocked-missing"
          style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: 13 }}
        >
          {labels.map(f => <li key={f.key} style={{ marginBottom: 2 }}>{f.label}</li>)}
        </ul>

        {!canFix && (
          <p
            data-testid="shop-identity-blocked-unauthorized"
            style={{ fontSize: 13, color: '#b45309', marginTop: 14, fontWeight: 600 }}
          >
            An owner needs to complete the shop profile before documents can be
            sent to customers.
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
          {canFix && (
            <button
              type="button"
              onClick={onOpenSettings}
              style={{
                padding: '10px 16px', borderRadius: 999, minHeight: 44,
                border: '1px solid var(--accent)', background: 'var(--accent)',
                color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
              }}
            >
              Complete shop profile
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 16px', borderRadius: 999, minHeight: 44,
              border: '1px solid var(--line)', background: 'transparent',
              color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            {/* "Back to the invoice", not "Cancel": nothing is being abandoned,
                and the invoice is exactly where they return to. */}
            Back to the invoice
          </button>
        </div>
      </div>
    </div>
  );
}
