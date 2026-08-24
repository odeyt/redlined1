/**
 * The Search Parts button was a no-op in production, and it was nobody's
 * fault at the point of the click.
 *
 * The button had `type="button"`, its onClick set state, and the dialog was
 * mounted on that state. All correct. The dialog opened at z-index 3000 —
 * UNDERNEATH AppShell's header (8000) and Sidebar (9999) — so it rendered
 * behind the application and looked like nothing happened. Measured in a
 * browser: the card's top sat at y=14 with a 72px header over it.
 *
 * Two fixes, and both are pinned here: a portal to <body> so no ancestor can
 * clip or contain the dialog, and a z-index above every fixed element the app
 * paints.
 *
 * There is no React Testing Library in this repo and the Jest environment is
 * `node`, so behaviour that needs a DOM is covered by the browser run and the
 * Playwright spec. What can be asserted here is the structure that made the
 * bug possible, and the pure helpers.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { MODAL_Z, MANUAL_FALLBACK, messageForStatus } from '../PartsSearchModal';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const LAUNCHER = read('features/estimates/PartsSearchLauncher.tsx');
const MODAL = read('features/estimates/PartsSearchModal.tsx');
const VIEW = read('features/estimates/EstimatesView.tsx');
const SHELL = read('components/AppShell.tsx');
const SIDEBAR = read('components/Sidebar.tsx');

/** Every z-index the app paints at a fixed position. */
function maxAppZIndex(): number {
  const found: number[] = [];
  for (const src of [SHELL, SIDEBAR]) {
    for (const m of src.matchAll(/zIndex:\s*(\d{3,})/g)) found.push(Number(m[1]));
  }
  return Math.max(...found);
}

describe('the dialog opens above the application, not behind it', () => {
  it('sits above every fixed element AppShell and Sidebar paint', () => {
    // The actual regression. 3000 was below the header at 8000.
    const appMax = maxAppZIndex();
    expect(appMax).toBeGreaterThan(0);
    expect(MODAL_Z).toBeGreaterThan(appMax);
  });

  it('is portalled to document.body', () => {
    // The number alone is not enough: inside the estimate panel, any ancestor
    // with transform/filter/contain would trap `position: fixed`, and
    // overflow would clip it. Escaping to <body> removes the whole class.
    expect(MODAL).toContain("import { createPortal } from 'react-dom'");
    expect(MODAL).toContain('return createPortal(');
    expect(MODAL).toContain('document.body,');
  });

  it('uses the named constant rather than a literal in the style', () => {
    expect(MODAL).toContain('zIndex: MODAL_Z');
    expect(MODAL).not.toMatch(/zIndex:\s*3000/);
  });

  it('guards the portal against server rendering', () => {
    // document does not exist during SSR of a client component. A plain guard
    // rather than a mounted flag from an effect — the dialog only renders
    // after a click, so there is no server render to hydrate against.
    expect(MODAL).toContain("if (typeof document === 'undefined') return null;");
  });
});

describe('the launcher cannot submit the estimate', () => {
  it('declares type="button" explicitly', () => {
    // Inside a <form> the default is submit — clicking Search Parts would
    // save the estimate.
    expect(LAUNCHER).toMatch(/type="button"/);
  });

  it('owns the button and the dialog together', () => {
    // They were a hundred lines apart in a two-thousand-line view, and the
    // bug lived in the gap.
    expect(LAUNCHER).toContain('data-testid="search-parts-button"');
    expect(LAUNCHER).toContain('<PartsSearchModal');
  });

  it('the estimate view no longer holds the open state itself', () => {
    expect(VIEW).toContain('<PartsSearchLauncher');
    expect(VIEW).not.toContain('partsSearchOpen');
  });

  it('mounts the dialog only while open, so closing discards the search', () => {
    expect(LAUNCHER).toContain('{open && (');
  });
});

describe('every failure names itself and offers the way forward', () => {
  it('never shows the caller the raw server word', () => {
    // The proxy answers a session-less API call with "Unauthorized", which
    // reached the technician verbatim and told them nothing.
    expect(messageForStatus(401)).toContain('session has expired');
    expect(messageForStatus(403)).toContain('session has expired');
    expect(messageForStatus(401).toLowerCase()).not.toContain('unauthorized');
  });

  it('distinguishes the failures a technician can act on', () => {
    expect(messageForStatus(429)).toContain('Too many searches');
    expect(messageForStatus(422)).toContain('not accepted');
    expect(messageForStatus(500)).toContain('temporarily unavailable');
    expect(messageForStatus(418)).toContain('could not be completed');
  });

  it('always says manual entry still works', () => {
    expect(MANUAL_FALLBACK).toBe('You can still add the part manually.');
    // Both the HTTP failure path and the network failure path append it.
    expect(MODAL).toContain('${messageForStatus(res.status)} ${MANUAL_FALLBACK}');
    expect(MODAL).toContain('Could not reach the parts service. ${MANUAL_FALLBACK}');
  });

  it('opens even when no provider is configured', () => {
    // A button that does nothing because a credential is missing is
    // indistinguishable from a broken button. The honest state lives INSIDE
    // the dialog, next to the note that manual entry still works.
    //
    // Comments stripped: the file DESCRIBES this rule in prose, and matching
    // prose would pass whatever the code did.
    const code = LAUNCHER
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/provider|credential/i);
    // The button is never disabled and never gated on provider state.
    expect(code).not.toContain('disabled');
    expect(MODAL).toContain('Parts catalog unavailable. You can still add a part manually.');
  });
});

describe('the panel is never in an unexplained blank', () => {
  it('names every state it can be in', () => {
    for (const s of ['idle', 'loading', 'success', 'empty', 'error', 'provider_unavailable']) {
      expect(MODAL).toContain(`'${s}'`);
    }
  });

  it('renders a line for each non-result state', () => {
    // ASCII dots deliberately: a PowerShell round-trip double-encoded this
    // file once already, and a literal that survives any tool is worth more
    // than a typographically correct one.
    expect(MODAL).toContain('Searching parts...');
    expect(MODAL).toContain('No matching parts found.');
    expect(MODAL).toContain('Parts catalog unavailable.');
    expect(MODAL).toContain('and press Search.');
  });

  it('exposes the state for tests and screen readers', () => {
    expect(MODAL).toContain('data-testid="search-state"');
    expect(MODAL).toContain('aria-live="polite"');
  });
});

describe('search modes', () => {
  it('offers description, OEM number and part number', () => {
    expect(MODAL).toContain("description: 'Description'");
    expect(MODAL).toContain("oem: 'OEM Number'");
    expect(MODAL).toContain("partNumber: 'Part Number'");
  });

  it('sends the term as the field the technician chose', () => {
    // A part number typed into a description search reaches a different
    // provider endpoint and comes back with different evidence.
    // `activeMode`, because a replayed search after a variant confirmation
    // must send the mode the technician originally chose, not whatever the
    // dialog happens to be showing when the replay runs.
    expect(MODAL).toContain("activeMode === 'oem' ? { oemNumber: q }");
    expect(MODAL).toContain("activeMode === 'partNumber' ? { manufacturerPartNumber: q }");
  });
});

describe('provider safety is unchanged by this repair', () => {
  it('does not touch fitment or scoring', () => {
    // This milestone is a UI repair. Catalogue fitment stays capped until
    // vehicle applicability exists.
    expect(MODAL).not.toMatch(/fitmentStatus\s*=\s*'verified'/);
    expect(LAUNCHER).not.toMatch(/score|fitment/i);
  });

  it('invents no price', () => {
    expect(MODAL).toContain('Price unavailable from this source');
  });
});
