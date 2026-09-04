'use client';

/**
 * The browser's copy of the shop identity answer.
 *
 * Asks the server rather than deriving it from a settings object the client
 * already holds. That is the whole point: `fetchShopSettings` substitutes
 * "My Shop" for a missing name and the invoice header substitutes "Redlined1",
 * so any client-side derivation would be reading a value that had already been
 * invented somewhere.
 *
 * This decides what the operator SEES. It never decides whether a document is
 * produced — the document routes ask the server themselves, so a stale or
 * tampered client answer cannot let an unusable invoice out.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ShopIdentityReadiness } from './shopIdentity';

export interface ShopIdentityState extends ShopIdentityReadiness {
  role: string;
  loading: boolean;
}

const UNKNOWN: ShopIdentityState = {
  ready: true,          // see below
  missingFields: [],
  settingsRowExists: true,
  shopId: '',
  reasonCode: 'ready',
  role: '',
  loading: true,
};

export function useShopIdentity(shopId: string): ShopIdentityState & { refresh: () => void } {
  const [state, setState] = useState<ShopIdentityState>(UNKNOWN);
  const [nonce, setNonce] = useState(0);

  /**
   * Marks itself loading HERE, in an event handler, rather than in the effect
   * below.
   *
   * A synchronous setState inside an effect body is a cascading render, and
   * the rule that forbids it is an error in this codebase. The effect that
   * follows therefore touches state only inside promise callbacks — the same
   * shape VehicleQualityPanel arrived at for the same reason.
   */
  const refresh = useCallback(() => {
    setState(s => ({ ...s, loading: true }));
    setNonce(n => n + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    // No shopId yet: resolve the initial loading state from inside a
    // microtask so nothing is set synchronously in the effect body.
    if (!shopId) {
      Promise.resolve().then(() => { if (alive) setState({ ...UNKNOWN, loading: false }); });
      return () => { alive = false; };
    }

    fetch(`/api/shop/identity?shopId=${encodeURIComponent(shopId)}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(json => { if (alive) setState({ ...json, loading: false }); })
      /**
       * A failed read reports READY, which is the opposite of the server's
       * rule and deliberate.
       *
       * This value only shows or hides a prompt. Defaulting it to "not ready"
       * would put a "complete your profile" banner in front of every operator
       * whenever the network hiccupped, including shops that finished their
       * profile months ago. The server refuses the actual document either way,
       * so being wrong here costs a missing nudge, not a bad invoice.
       */
      .catch(() => { if (alive) setState({ ...UNKNOWN, shopId, loading: false }); });

    return () => { alive = false; };
  }, [shopId, nonce]);

  return { ...state, refresh };
}
