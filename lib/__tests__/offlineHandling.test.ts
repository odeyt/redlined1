/**
 * Phase 10 — offline and bad connections.
 *
 * The failure this prevents is not a dropped connection. It is a technician
 * marking twenty inspection items on a phone that quietly stopped saving and
 * finding out an hour later. Losing the network in a workshop is unavoidable;
 * not being told is not.
 *
 * Verified in a browser: with fetch to /api/ping forced to fail while
 * navigator.onLine stayed true — the shop-wifi-with-no-uplink case — the
 * warning appeared, and on restore the "Back online" notice replaced it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const hook   = read('lib/useOnline.ts');
const banner = read('components/ConnectionStatus.tsx');
const layout = read('app/layout.tsx');
const ro     = read('features/repair-orders/RepairOrdersView.tsx');
const dvi    = read('features/inspections/GuidedInspection.tsx');

describe('offline is detected, not assumed', () => {
  it('does not trust navigator.onLine when it claims to be online', () => {
    // A shop access point that has lost its uplink reports true. That is the
    // most common workshop failure, and the one the flag gets wrong.
    expect(hook).toMatch(/navigator\.onLine === false/);
    expect(hook).toMatch(/await fetch\('\/api\/ping'/);
  });

  it('treats navigator.onLine === false as authoritative', () => {
    // False is reliable: no network is no network. Skipping the probe there
    // avoids a pointless five-second timeout.
    expect(hook).toMatch(/if \(typeof navigator !== 'undefined' && navigator\.onLine === false\) \{\s*\n\s*set\('offline'\);/);
  });

  it('bounds the probe, so a hanging captive portal cannot stall it', () => {
    expect(hook).toMatch(/AbortSignal\.timeout\(PROBE_TIMEOUT_MS\)/);
    expect(hook).toMatch(/PROBE_TIMEOUT_MS = 5_000/);
  });

  it('probes uncached — a cached 200 would mean nothing', () => {
    expect(hook).toMatch(/cache: 'no-store'/);
  });

  it('stops polling when the tab is hidden', () => {
    // A phone in a pocket should not wake its radio every thirty seconds.
    expect(hook).toMatch(/visibilitychange/);
    expect(hook).toMatch(/document\.visibilityState === 'visible'/);
  });

  it('reacts to the browser events as well as polling', () => {
    expect(hook).toMatch(/window\.addEventListener\('offline', onOffline\)/);
    expect(hook).toMatch(/window\.addEventListener\('online', onOnline\)/);
  });

  it('cleans up its timer and listeners', () => {
    expect(hook).toMatch(/clearInterval\(timer\)/);
    expect(hook).toMatch(/removeEventListener\('offline'/);
    expect(hook).toMatch(/removeEventListener\('online'/);
  });

  it('starts optimistic rather than flashing a warning on every load', () => {
    expect(hook).toMatch(/useState<Connection>\('online'\)/);
  });
});

describe('the user is told, in both directions', () => {
  it('warns that nothing is saving', () => {
    expect(banner).toMatch(/nothing is saving/);
    expect(banner).toMatch(/Do not close this page/);
  });

  it('says when it is safe again', () => {
    // Without this the only way to know is to try, and a failed save on a
    // form full of work is where people give up and retype it elsewhere.
    expect(banner).toMatch(/Back online\. Save your work now\./);
  });

  it('the restored notice goes away on its own', () => {
    expect(banner).toMatch(/setTimeout\(\(\) => setShowRestored\(false\), 6000\)/);
  });

  it('is announced to assistive technology', () => {
    expect(banner).toMatch(/role="status"/);
    expect(banner).toMatch(/aria-live="polite"/);
  });

  it('clears the notch', () => {
    expect(banner).toMatch(/env\(safe-area-inset-top\)/);
  });

  it('is mounted app-wide', () => {
    expect(layout).toMatch(/<ConnectionStatus \/>/);
  });
});

describe('financial writes require confirmed connectivity', () => {
  it('invoice conversion checks the network first', () => {
    expect(ro).toMatch(/if \(!\(await confirmOnline\(\)\)\)/);
  });

  it('checks live rather than reading the polled status', () => {
    // The polled value can be thirty seconds stale, and "it was fine half a
    // minute ago" is not a reason to start writing financial records.
    expect(hook).toMatch(/export async function confirmOnline/);
    expect(ro).toMatch(/can be half a minute stale/);
  });

  it('the check happens before a number is allocated', () => {
    const fn = ro.slice(ro.indexOf('async function handleConvertToInvoice'));
    expect(fn.indexOf('confirmOnline()')).toBeLessThan(fn.indexOf('draftInvoiceFor(ro)'));
  });

  it('says plainly that nothing changed', () => {
    // Ambiguity here sends someone looking for an invoice that does not exist.
    expect(ro).toMatch(/nothing has changed/);
  });

  it('no offline queue writes financial records', () => {
    // Deliberately absent: the brief forbids unsafe offline writes to
    // financial records, and this codebase has no transactional sync.
    expect(hook).not.toMatch(/queue|outbox|pendingWrites/i);
  });
});

describe('unsaved inspection work is not lost silently', () => {
  it('warns before the tab closes mid-walkthrough', () => {
    expect(dvi).toMatch(/window\.addEventListener\('beforeunload', warn\)/);
  });

  it('only once something has actually been judged', () => {
    // A prompt on an untouched form teaches people to dismiss it unread.
    expect(dvi).toMatch(/if \(judged\.size === 0\) return;/);
  });

  it('removes the handler when the walkthrough closes', () => {
    expect(dvi).toMatch(/removeEventListener\('beforeunload', warn\)/);
  });
});
