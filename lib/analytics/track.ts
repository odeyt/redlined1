/**
 * Send one event to Google Analytics — the GA4 tag the root layout loads.
 *
 * The layout defines `window.gtag` in an afterInteractive script, so a
 * component effect can run before it exists. Rather than drop those events,
 * this queues them the way gtag itself does: an `arguments` object pushed onto
 * `window.dataLayer`, which gtag.js drains when it loads. (A plain array is
 * NOT equivalent — gtag.js ignores it — which is why the stub below uses
 * `arguments`.)
 *
 * Fire-and-forget by contract: analytics must never break a click, a form
 * submission or a video. Every failure is swallowed, and with no browser
 * (server render, jest) it does nothing.
 *
 * Parameter values are short, fixed identifiers — which CTA, which section.
 * Never pass form contents or anything that identifies the visitor.
 */
export type AnalyticsParams = Record<string, string | number | boolean>;

type Gtag = (...args: unknown[]) => void;

export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  try {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { gtag?: Gtag; dataLayer?: unknown[] };
    if (typeof w.gtag === 'function') {
      w.gtag('event', name, params);
      return;
    }
    w.dataLayer = w.dataLayer || [];
    const queue = w.dataLayer;
    // eslint-disable-next-line prefer-rest-params -- gtag.js requires a real arguments object
    const stub = function () { queue.push(arguments); } as Gtag;
    stub('event', name, params);
  } catch {
    /* analytics is never allowed to interrupt the page */
  }
}
