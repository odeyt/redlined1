import { trackEvent } from '@/lib/analytics/track';

/**
 * trackEvent must reach GA whether or not gtag.js has loaded yet, and must
 * never throw into the click or submit that called it.
 */
type W = { gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };
const g = globalThis as unknown as { window?: W };

afterEach(() => { delete g.window; });

it('does nothing without a browser', () => {
  expect(() => trackEvent('x')).not.toThrow();
});

it('calls gtag when it is loaded', () => {
  const gtag = jest.fn();
  g.window = { gtag };
  trackEvent('start_free_click', { cta_location: 'hero' });
  expect(gtag).toHaveBeenCalledWith('event', 'start_free_click', { cta_location: 'hero' });
});

it('queues an arguments object on dataLayer before gtag loads', () => {
  g.window = {};
  trackEvent('shop_owner_demo_view', { page: 'shop_owner_demo' });
  const queued = g.window.dataLayer?.[0] as IArguments;
  // gtag.js only drains arguments objects, not plain arrays.
  expect(Object.prototype.toString.call(queued)).toBe('[object Arguments]');
  expect(Array.from(queued)).toEqual(['event', 'shop_owner_demo_view', { page: 'shop_owner_demo' }]);
});

it('swallows a failing gtag', () => {
  g.window = { gtag: () => { throw new Error('blocked'); } };
  expect(() => trackEvent('video_play')).not.toThrow();
});
