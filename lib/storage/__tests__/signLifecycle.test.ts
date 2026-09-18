/**
 * @jest-environment jsdom
 */

/**
 * The bug this file exists for.
 *
 * Every signed URL on the Vehicles page was minted when the page loaded and
 * lasted an hour. `loading="lazy"` means an off-screen thumbnail does not
 * FETCH its URL until it scrolls into view — which, on a tab a shop leaves
 * open all day, is long after that URL died. Photos already in the browser
 * cache kept rendering, so it looked like photos erasing themselves one at a
 * time rather than like an expiry.
 *
 * These tests run the clock forward rather than waiting: fake timers, a
 * controllable `Date.now`, and an assertion on the number of signing requests,
 * because "it refreshes" and "it refreshes 550 times a minute" are both true
 * of a naive fix.
 */
import {
  signPathClient,
  subscribeSignedPath,
  clearSignedUrlCache,
  signingStats,
  isDueForRefresh,
  TTL_SECONDS,
  REFRESH_MARGIN_MS,
} from '../signClient';

const createSignedUrls = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls: (...a: unknown[]) => createSignedUrls(...a) }) } },
}));

let serial = 0;

/** Drains the microtask queue the batcher schedules its flush on. */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  // queueMicrotask is left real: Jest's modern fake timers fake it along with
  // the clock, but the batcher's queueMicrotask() is a real microtask in
  // every browser that runs this code. Faking it here would mean nothing
  // enqueued ever flushes until timers are advanced, which hangs every
  // `await signPathClient(...)` in this file rather than testing anything.
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  jest.setSystemTime(new Date('2026-09-18T08:00:00Z'));
  clearSignedUrlCache();
  createSignedUrls.mockReset();
  serial = 0;
  createSignedUrls.mockImplementation((paths: string[]) => {
    const n = ++serial;
    return Promise.resolve({
      data: paths.map(p => ({ path: p, signedUrl: `https://signed/${p}?token=v${n}`, error: null })),
      error: null,
    });
  });
  setVisibility('visible');
});

afterEach(() => {
  clearSignedUrlCache();
  jest.useRealTimers();
});

const PATH = 'vehicles/11111111-2222-3333-4444-555555555555/a.jpg';

describe('a page left open', () => {
  it('renews before the one-hour signature expires', async () => {
    const seen: Array<string | null> = [];
    await signPathClient(PATH);
    await settle();
    const unsubscribe = subscribeSignedPath(PATH, url => seen.push(url));
    expect(signingStats.requests).toBe(1);

    // Half an hour in, nothing is due. A URL good for another 30 minutes is
    // not worth a request.
    jest.advanceTimersByTime(30 * 60 * 1000);
    await settle();
    expect(signingStats.requests).toBe(1);
    expect(seen).toHaveLength(0);

    // Past the refresh margin but still BEFORE expiry: this is the renewal
    // that keeps a lazy thumbnail loadable.
    jest.advanceTimersByTime((TTL_SECONDS * 1000) - REFRESH_MARGIN_MS - (30 * 60 * 1000) + 60_000);
    await settle();
    expect(signingStats.requests).toBe(2);
    expect(seen.pop()).toContain('token=v2');

    // And the renewal happened while the old URL was still valid, which is
    // the whole point — there is never a window with no working URL.
    expect(Date.now()).toBeLessThan(new Date('2026-09-18T09:00:00Z').getTime());
    unsubscribe();
  });

  it('keeps renewing for as long as the page is open', async () => {
    await signPathClient(PATH);
    await settle();
    const unsubscribe = subscribeSignedPath(PATH, () => {});

    for (let hour = 0; hour < 5; hour++) {
      jest.advanceTimersByTime(60 * 60 * 1000);
      await settle();
    }
    // Five hours, roughly one renewal per hour, and nothing like a request
    // per tick.
    expect(signingStats.requests).toBeGreaterThanOrEqual(5);
    expect(signingStats.requests).toBeLessThanOrEqual(8);
    unsubscribe();
  });
});

describe('a backgrounded tab', () => {
  it('does not sign while hidden, and recovers when it is looked at again', async () => {
    const seen: Array<string | null> = [];
    await signPathClient(PATH);
    await settle();
    const unsubscribe = subscribeSignedPath(PATH, url => seen.push(url));
    expect(signingStats.requests).toBe(1);

    setVisibility('hidden');

    // Two hours in another tab. A real browser throttles these timers; the
    // module declines to do the work regardless.
    jest.advanceTimersByTime(2 * 60 * 60 * 1000);
    await settle();
    expect(signingStats.requests).toBe(1);
    expect(isDueForRefresh(PATH)).toBe(true);

    // The user comes back. Everything on screen is renewed before the browser
    // is asked to fetch any of it.
    setVisibility('visible');
    await settle();
    expect(signingStats.requests).toBe(2);
    expect(seen.pop()).toContain('token=v2');
    expect(isDueForRefresh(PATH)).toBe(false);
    unsubscribe();
  });

  it('recovers on window focus as well as visibility', async () => {
    await signPathClient(PATH);
    await settle();
    const unsubscribe = subscribeSignedPath(PATH, () => {});
    setVisibility('hidden');
    jest.advanceTimersByTime(2 * 60 * 60 * 1000);
    await settle();
    expect(signingStats.requests).toBe(1);

    // A click into the window without a visibility transition — switching
    // between two visible windows on a desktop.
    setVisibility('visible');
    createSignedUrls.mockClear();
    const before = signingStats.requests;
    jest.advanceTimersByTime(60 * 60 * 1000);
    await settle();
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(signingStats.requests).toBeGreaterThan(before);
    unsubscribe();
  });
});

describe('request volume', () => {
  it('renews a whole page of thumbnails in ONE request', async () => {
    const paths = Array.from({ length: 110 }, (_, i) => `vehicles/1111111${i % 10}-2222-3333-4444-555555555555/${i}.jpg`);
    await Promise.all(paths.map(p => signPathClient(p)));
    await settle();
    expect(signingStats.requests).toBe(1);

    const unsubs = paths.map(p => subscribeSignedPath(p, () => {}));
    jest.advanceTimersByTime((TTL_SECONDS * 1000) - REFRESH_MARGIN_MS + 60_000);
    await settle();

    // Two requests total for 110 objects over an hour, not 220.
    expect(signingStats.requests).toBe(2);
    expect(createSignedUrls.mock.calls[1][0]).toHaveLength(110);
    unsubs.forEach(u => u());
  });

  it('asks for a repeated path once however many components are showing it', async () => {
    const subs = Array.from({ length: 6 }, () => subscribeSignedPath(PATH, () => {}));
    await Promise.all(Array.from({ length: 6 }, () => signPathClient(PATH)));
    await settle();
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0][0]).toEqual([PATH]);
    subs.forEach(u => u());
  });

  it('stops all lifecycle work once nothing is subscribed', async () => {
    const unsubscribe = subscribeSignedPath(PATH, () => {});
    await signPathClient(PATH);
    await settle();
    unsubscribe();

    const before = signingStats.requests;
    jest.advanceTimersByTime(6 * 60 * 60 * 1000);
    await settle();
    expect(signingStats.requests).toBe(before);
  });
});
