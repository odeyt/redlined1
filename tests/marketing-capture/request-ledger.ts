/**
 * Installs the browser request ledger on a Playwright context. See
 * lib/marketing-capture/requestLedger.ts for the rules.
 *
 * Every HTTP request and WebSocket the context opens is classified before it
 * leaves the browser. Anything not `allowed` is aborted (HTTP) or closed
 * without connecting (WebSocket). Service workers must be blocked in the
 * config: their requests would bypass context.route.
 *
 * Entries hold method, hostname and pathname only. The request's URL query,
 * body, cookies and headers are never read into an entry or written anywhere.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { BrowserContext } from '@playwright/test';
import {
  classifyRequest, selfTestFailures, summarize, ledgerFailures, SELF_TEST_PROBES,
  type LedgerEntry, type LedgerPhase, type SelfTestOutcome,
} from '@/lib/marketing-capture/requestLedger';

export interface Ledger {
  entries: LedgerEntry[];
  phase: LedgerPhase;
}

export async function installLedger(context: BrowserContext, phase: LedgerPhase): Promise<Ledger> {
  const ledger: Ledger = { entries: [], phase };

  await context.route('**/*', async route => {
    const request = route.request();
    const entry = classifyRequest(ledger.phase, request.method(), request.url());
    ledger.entries.push(entry);
    if (entry.verdict === 'allowed') await route.continue();
    else await route.abort('blockedbyclient');
  });

  await context.routeWebSocket(/.*/, ws => {
    const entry = classifyRequest(ledger.phase, 'WS', ws.url(), 'websocket');
    ledger.entries.push(entry);
    if (entry.verdict === 'allowed') ws.connectToServer();
    else ws.close({ code: 1008, reason: 'blocked by the capture request ledger' });
  });

  return ledger;
}

/**
 * Proves the installed routes abort each probe inside the browser, from a
 * blank page in the SAME context the walkthrough uses. The page is closed
 * afterwards; its (blank) video is not kept.
 */
export async function runLedgerSelfTest(context: BrowserContext, ledger: Ledger): Promise<string[]> {
  const previous = ledger.phase;
  ledger.phase = 'self-test';
  const page = await context.newPage();
  const outcomes: SelfTestOutcome[] = [];
  try {
    for (const probe of SELF_TEST_PROBES) {
      // no-cors simple requests: no preflight, and an opaque success would still resolve.
      const reachedNetwork = await page.evaluate(async ({ url, method }) => {
        try {
          await fetch(url, { method, mode: 'no-cors', body: method === 'POST' ? 'ledger-self-test' : undefined, cache: 'no-store' });
          return true;
        } catch {
          return false;
        }
      }, { url: probe.url, method: probe.method });
      outcomes.push({ url: probe.url, reachedNetwork });
    }
  } finally {
    await page.close();
    ledger.phase = previous;
  }
  return selfTestFailures(ledger.entries, outcomes);
}

export function ledgerReport(ledger: Ledger) {
  return { summary: summarize(ledger.entries), failures: ledgerFailures(ledger.entries) };
}

/** Writes JSON under marketing-output/ (gitignored). Callers pass only non-secret values. */
export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
