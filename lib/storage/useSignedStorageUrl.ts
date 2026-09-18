'use client';

/**
 * The signed form of a stored shop-assets reference, kept current for as long
 * as the component is mounted.
 *
 * Accepts either the canonical object key (`vehicles/<id>/<file>`) or a
 * legacy stored URL, so a component does not have to know which of the two
 * columns its service returned.
 *
 * ## Why this does not start on the stored value
 *
 * It used to render the stored public URL first and swap in the signature
 * when it arrived. That made sense while the bucket was public — the stored
 * URL resolved, so the first paint was a real image. Since the bucket is
 * private that first paint is a guaranteed 400, which fires `onError` before
 * the signature has even been requested and burns the one retry a thumbnail
 * gets. So a shop-assets object renders nothing until it is signed, and
 * anything that is NOT such an object (a blob: preview, a data: URI, a
 * third-party image) passes straight through untouched.
 *
 * ## Why signing is a subscription
 *
 * See lib/storage/signClient.ts. A signature lasts an hour and a lazy
 * thumbnail may not be fetched for a day; the module re-signs before expiry
 * and on tab focus and pushes the new URL here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  refreshSignedPath,
  resolveObjectPath,
  signPathClient,
  subscribeSignedPath,
} from './signClient';

export type SignedStatus = 'pending' | 'ready' | 'unavailable';

export interface SignedStorageObject {
  /** What to put in src/href. Empty while a signature is pending. */
  src: string;
  status: SignedStatus;
  /**
   * Ask for a fresh signature after the browser failed to load `src`.
   *
   * Allowed once per object per signature. A second failure means the URL was
   * not the problem — the object is gone, or the policy refuses it — and
   * retrying again would be an infinite loop between <img> and the signer.
   */
  retry: () => void;
  /** Tell the hook the image loaded, which re-arms the single retry. */
  markLoaded: () => void;
}

/**
 * One retry per path, held outside React so a remount (a virtualised row
 * scrolling back into view) cannot reset it and start the loop again.
 * Cleared when the object loads, and when a renewal delivers a URL.
 */
const attempts = new Map<string, number>();

interface State { key: string; src: string; status: SignedStatus }

function initialState(path: string | null, value: string | null | undefined): State {
  // A non-object value is shown as-is; only a shop-assets object waits.
  return path
    ? { key: path, src: '', status: 'pending' }
    : { key: `raw:${value ?? ''}`, src: value ?? '', status: value ? 'ready' : 'pending' };
}

export function useSignedStorageObject(value: string | null | undefined): SignedStorageObject {
  const path = resolveObjectPath(value);
  const key = path ?? `raw:${value ?? ''}`;

  const [state, setState] = useState<State>(() => initialState(path, value));
  // Resetting during render rather than in an effect: React's own pattern for
  // "this component is now showing a different thing". Doing it in an effect
  // would paint the previous photo for one frame — which, when the thing that
  // changed is an upload replacing a photo, is the old photo flashing back.
  if (state.key !== key) setState(initialState(path, value));

  /**
   * The object this hook is currently showing.
   *
   * Every async resolution checks it before writing state, so a signature that
   * arrives after the user swiped to the next photo — or after an upload
   * replaced this one — is dropped instead of painting the previous image over
   * the new one.
   */
  const activeKey = useRef(key);

  useEffect(() => {
    activeKey.current = key;
    if (!path) return;

    let live = true;
    const accept = (url: string | null) => {
      if (!live || activeKey.current !== key) return;
      if (url) {
        // NOT attempts.delete(path) here: a successful SIGNATURE is not
        // evidence the object is loadable, and this callback also fires for
        // the renewal retry() itself just triggered via refreshSignedPath()
        // (subscribeSignedPath sees every renewal, including forced ones).
        // Clearing the guard here would erase the attempt retry() just
        // recorded before the browser has even tried the new src, which is
        // exactly the sign-fail-sign-fail loop the guard exists to stop.
        // Only markLoaded() - a real onLoad - is proof the object is fine.
        setState({ key, src: url, status: 'ready' });
      } else {
        setState(prev => (prev.key === key ? { ...prev, status: 'unavailable' } : prev));
      }
    };

    void signPathClient(path).then(accept);
    const unsubscribe = subscribeSignedPath(path, accept);

    return () => { live = false; unsubscribe(); };
  }, [key, path]);

  const retry = useCallback(() => {
    if (!path) {
      setState(prev => ({ ...prev, status: 'unavailable' }));
      return;
    }
    const used = attempts.get(path) ?? 0;
    if (used >= 1) {
      // Second failure. The signature is not what is wrong.
      setState(prev => (prev.key === path ? { ...prev, status: 'unavailable' } : prev));
      return;
    }
    attempts.set(path, used + 1);
    setState(prev => (prev.key === path ? { ...prev, status: 'pending' } : prev));
    void refreshSignedPath(path).then(url => {
      if (activeKey.current !== path) return;
      setState(prev => (prev.key === path
        ? (url ? { key: path, src: url, status: 'ready' } : { ...prev, status: 'unavailable' })
        : prev));
    });
  }, [path]);

  const markLoaded = useCallback(() => {
    if (path) attempts.delete(path);
  }, [path]);

  return { src: state.src, status: state.status, retry, markLoaded };
}

/**
 * String-only form, for an href or a next/image src.
 *
 * Signing here rather than on click, deliberately: a click handler that has
 * to await a signature before calling window.open is blocked as a popup by
 * every browser, so the href has to be ready before the user reaches for it.
 */
export function useSignedStorageUrl(url: string | null | undefined): string {
  return useSignedStorageObject(url).src;
}

/** Test seam — the retry guard is module state. */
export function clearRetryGuard(): void {
  attempts.clear();
}
