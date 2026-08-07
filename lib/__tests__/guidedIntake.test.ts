/**
 * Guided vehicle intake.
 *
 * The intake form asks for eight things at once. At a counter with a customer
 * waiting that reads as a wall and gets half-filled — production intake records
 * routinely carry a make and model and nothing else, and the DVI that follows
 * opens blank because there was nothing to carry.
 *
 * Asking one question at a time with an explicit Skip changes what an empty
 * field means. On the form, blank is ambiguous: not asked, or not known? Here
 * every field is put to the advisor, so the review screen can honestly
 * distinguish "Skipped" from "Not captured".
 *
 * Phone first — advisors do this standing next to the car — which is a set of
 * specific mechanics, not a layout opinion: 16px inputs or iOS zooms the page
 * on focus, 52px targets, and safe-area padding so the buttons clear the home
 * indicator.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const guided = read('features/triage/steps/GuidedVehicleStep.tsx');
const view   = read('features/triage/TriageView.tsx');

describe('it asks one thing at a time', () => {
  it('renders a single question from an ordered list', () => {
    expect(guided).toMatch(/const QUESTIONS: Question\[\] = \[/);
    expect(guided).toMatch(/const q = idx >= 0 && idx < QUESTIONS\.length \? QUESTIONS\[idx\] : null;/);
  });

  it('advances and goes back', () => {
    // Both directions go through the index helpers rather than ±1, so a
    // question the VIN already answered is stepped over either way.
    expect(guided).toMatch(/setIdx\(nextIndex\(idx\)\)/);
    expect(guided).toMatch(/setIdx\(prevIndex\(idx\)\)/);
    expect(guided).not.toMatch(/setIdx\(i => i [+-] 1\)/);
  });

  it('shows progress against the real total', () => {
    expect(guided).toMatch(/Question \$\{Math\.min\(position \+ 1, total\)\} of \$\{total\}/);
  });

  it('Enter advances on a text question', () => {
    expect(guided).toMatch(/e\.key === 'Enter'/);
  });
});

describe('anything can be skipped', () => {
  it('every question has a skip', () => {
    expect(guided).toMatch(/<button onClick=\{skip\}/);
  });

  it('a skip is recorded, not just left blank', () => {
    // This is what lets the review screen tell "Skipped" from "Not captured".
    expect(guided).toMatch(/setSkipped\(prev => new Set\(prev\)\.add\(q\.key as string\)\)/);
  });

  it('answering later clears the skip', () => {
    expect(guided).toMatch(/n\.delete\(q\.key as string\)/);
  });

  it('the review screen distinguishes the two', () => {
    expect(guided).toMatch(/wasSkipped \? 'Skipped' : 'Not captured'/);
  });

  it('a required field can be deferred but not lost', () => {
    // "Not known yet" moves on; the review screen still blocks Continue and
    // names what is outstanding, so it cannot quietly go missing.
    expect(guided).toMatch(/q\.required \? 'Not known yet' : 'Skip'/);
    expect(guided).toMatch(/Still needed before the next step/);
    expect(guided).toMatch(/disabled=\{missingRequired\.length > 0\}/);
  });
});

describe('it uses what the shop already knows', () => {
  it('searches existing customers', () => {
    expect(guided).toMatch(/from\('customers'\)/);
  });

  it('offers that customer\'s vehicles', () => {
    expect(guided).toMatch(/Their vehicles — tap to fill everything/);
  });

  it('picking one fills everything and skips ahead to review', () => {
    // Re-asking seven questions the record already answers is the friction
    // this exists to remove.
    expect(guided).toMatch(/setIdx\(QUESTIONS\.length\)/);
    expect(guided).toMatch(/vehicleId: v\.id, vin: v\.vin, plate: v\.plate/);
  });

  it('carries VIN and plate, which the old form never captured', () => {
    expect(guided).toMatch(/vin: v\.vin ?\?\? ''/);
  });

  it('a walk-in can proceed with no customer at all', () => {
    expect(guided).toMatch(/Skip — walk-in/);
  });
});

describe('it works on a phone', () => {
  it('inputs are 16px, so iOS does not zoom the page on focus', () => {
    expect(guided).toMatch(/fontSize: 16/);
  });

  it('touch targets clear the 44px minimum', () => {
    const targets = guided.match(/minHeight: (\d+)/g) ?? [];
    expect(targets.length).toBeGreaterThan(0);
    targets.forEach(t => expect(Number(t.replace('minHeight: ', ''))).toBeGreaterThanOrEqual(44));
  });

  it('clears the home indicator', () => {
    expect(guided).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it('scales type to the viewport rather than fixing it', () => {
    expect(guided).toMatch(/clamp\(19px, 4\.5vw, 24px\)/);
  });

  it('stacks buttons on a narrow screen', () => {
    expect(guided).toMatch(/@media \(max-width: 420px\)/);
  });

  it('choices reflow instead of overflowing', () => {
    expect(guided).toMatch(/repeat\(auto-fit, minmax\(140px, 1fr\)\)/);
  });

  it('asks for the numeric keypad where the answer is a number', () => {
    expect(guided).toMatch(/inputMode: 'numeric'/);
    expect(guided).toMatch(/enterKeyHint/);
  });

  it('does not pop the keyboard over a list of choices', () => {
    expect(guided).toMatch(/if \(q && !q\.options\)/);
  });
});

describe('it respects the theme and motion preferences', () => {
  it('uses the app\'s tokens rather than hardcoded colours', () => {
    // Fields deliberately no longer use --surface-soft: it sits within a few
    // values of the card in both themes, which is what made them invisible.
    // Everything else still comes from the palette.
    expect(guided).toMatch(/var\(--accent\)/);
    expect(guided).toMatch(/var\(--muted\)/);
    expect(guided).toMatch(/var\(--text\)/);
    expect(guided).toMatch(/var\(--surface\)/);
  });

  it('honours prefers-reduced-motion', () => {
    expect(guided).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('it is integrated, not bolted on', () => {
  it('the intake defaults to guided', () => {
    expect(view).toMatch(/const \[guided, setGuided\] = useState\(true\)/);
  });

  it('the original form is one tap away', () => {
    // Removing it would take away a workflow that suits some advisors.
    expect(guided).toMatch(/Use full form/);
    expect(view).toMatch(/onUseForm=\{\(\) => setGuided\(false\)\}/);
  });

  it('it hands off to the existing next step', () => {
    expect(view).toMatch(/onNext=\{\(\) => go\('category'\)\}/);
  });
});

/**
 * Adding a customer without leaving intake.
 *
 * The guided flow could search customers and skip for a walk-in, but a search
 * that found nothing dead-ended: the only way forward was to skip, or leave for
 * the Customers module and lose the vehicle details already entered. New
 * customers are the common case at a shop taking on work.
 */
describe('a customer can be created during intake', () => {
  it('offers to add when nothing matches', () => {
    expect(guided).toMatch(/\+ Add \{query\.trim\(\) \? `“\$\{query\.trim\(\)\}”` : 'a new customer'\}/);
  });

  it('carries the typed search into the name, rather than asking twice', () => {
    expect(guided).toMatch(/setNewCust\(\{ name: query\.trim\(\), phone: '', email: '' \}\)/);
  });

  it('only the name is required', () => {
    expect(guided).toMatch(/placeholder="Full name \*"/);
    expect(guided).toMatch(/placeholder="Phone \(optional\)"/);
    expect(guided).toMatch(/placeholder="Email \(optional\)"/);
  });

  it('goes through saveCustomer, so customer.created still fires', () => {
    // A direct insert would save the row and skip the event, making the
    // customer invisible to everything downstream of it.
    expect(guided).toMatch(/const \{ saveCustomer \} = await import\('@\/services\/customerService'\)/);
    expect(guided).not.toMatch(/from\('customers'\)\s*\n?\s*\.insert/);
  });

  it('selects the new customer immediately', () => {
    // Creating one and then making the advisor find it again is the friction
    // this removes.
    expect(guided).toMatch(/await selectCustomer\(option\)/);
  });

  it('adds them to the list in order', () => {
    expect(guided).toMatch(/\.sort\(\(a, b\) => a\.name\.localeCompare\(b\.name\)\)/);
  });

  it('reports a failure instead of swallowing it', () => {
    expect(guided).toMatch(/setCustError\(e instanceof Error \? e\.message/);
    expect(guided).toMatch(/\{custError && \(/);
  });

  it('cannot be double-submitted', () => {
    expect(guided).toMatch(/disabled=\{savingCust \|\| !newCust\.name\.trim\(\)\}/);
    expect(guided).toMatch(/savingCust \? 'Saving…' : 'Save customer'/);
  });

  it('is dismissable without saving', () => {
    expect(guided).toMatch(/onClick=\{\(\) => \{ setShowNew\(false\); setCustError\(''\); \}\}/);
  });

  it('hides the add option once a customer is chosen', () => {
    expect(guided).toMatch(/\{!showNew && !vehicle\.customerId && \(/);
  });

  it('uses the right mobile keyboards for phone and email', () => {
    expect(guided).toMatch(/inputMode="tel"/);
    expect(guided).toMatch(/inputMode="email"/);
    expect(guided).toMatch(/autoCapitalize="off" autoCorrect="off"/);
  });
});

/**
 * VIN first, then only what the VIN could not answer.
 *
 * A VIN establishes make, model, year, engine, fuel and transmission in one
 * scan. Asking for them afterwards wastes the advisor's time and invites a
 * typed answer that contradicts the VIN — a worse record than the VIN alone.
 *
 * NHTSA's database does not cover every vehicle sold in Laos, so a decode that
 * returns a make and nothing else is normal. Only fields that actually came
 * back are treated as answered; the rest are still asked.
 */
describe('the VIN is asked first and fills what it can', () => {
  it('the VIN question comes before make, model and year', () => {
    const order = ['vin', 'make', 'model', 'year'].map(k => guided.indexOf(`key: '${k}'`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBeGreaterThan(-1);
  });

  it('decodes rather than merely storing what was typed', () => {
    expect(guided).toMatch(/const \{ decodeVinAPI \} = await import\('@\/services\/vinDecoderService'\)/);
  });

  it('reuses the existing decoder instead of a second one', () => {
    expect(guided).not.toMatch(/vpic\.nhtsa/);
  });

  it('records which fields the VIN answered', () => {
    expect(guided).toMatch(/setAutoFilled\(filled\)/);
  });

  it('steps over those questions instead of asking them', () => {
    expect(guided).toMatch(/while \(i < QUESTIONS\.length && filled\.has\(QUESTIONS\[i\]\.key as string\)\) i\+\+/);
    expect(guided).toMatch(/setIdx\(nextIndex\(0, filled\)\)/);
  });

  it('Back also steps over them, so it cannot land on a hidden question', () => {
    expect(guided).toMatch(/function prevIndex/);
    expect(guided).toMatch(/while \(i >= 0 && autoFilled\.has\(QUESTIONS\[i\]\.key as string\)\) i--/);
  });

  it('only takes fields that actually came back', () => {
    // NHTSA returns partial data for many non-US vehicles; treating a blank as
    // answered would skip a question and leave the field empty.
    expect(guided).toMatch(/const take = \(key: keyof TriageVehicle, value: string\) => \{\s*\n\s*if \(!value\) return;/);
  });

  it('says so when a valid VIN returns nothing useful', () => {
    expect(guided).toMatch(/did not return any vehicle details/);
  });

  it('still asks for mileage, which no VIN can answer', () => {
    expect(guided).not.toMatch(/take\('mileage'/);
  });
});

describe('the VIN can always be skipped', () => {
  it('offers an explicit out', () => {
    expect(guided).toMatch(/"Don't have it"/);
  });

  it('is not a required question', () => {
    expect(guided).toMatch(/key: 'vin',[^\n]*kind: 'vin'/);
    expect(guided).not.toMatch(/key: 'vin',[^\n]*required: true/);
  });

  it('skipping leads to the make question as normal', () => {
    expect(guided).toMatch(/setIdx\(nextIndex\(idx\)\)/);
  });
});

describe('the VIN field behaves like a VIN', () => {
  it('is fixed at 17 characters and counts them', () => {
    expect(guided).toMatch(/maxLength=\{q\.kind === 'vin' \? 17 : undefined\}/);
    expect(guided).toMatch(/\{draft\.trim\(\)\.length\}\/17/);
  });

  it('refuses to decode the wrong length rather than calling the API', () => {
    expect(guided).toMatch(/if \(raw\.length !== 17\)/);
    expect(guided).toMatch(/disabled=\{decoding \|\| draft\.trim\(\)\.length !== 17\}/);
  });

  it('uppercases as typed', () => {
    expect(guided).toMatch(/q\.kind === 'vin' \? e\.target\.value\.toUpperCase\(\)/);
  });

  it('is not autocapitalised word-by-word or spell-checked', () => {
    // A phone would otherwise "correct" a VIN into something else.
    expect(guided).toMatch(/autoCapitalize=\{q\.kind === 'vin' \? 'characters' : 'words'\}/);
    expect(guided).toMatch(/spellCheck=\{q\.kind === 'vin' \? false : undefined\}/);
  });

  it('cannot be double-submitted while decoding', () => {
    expect(guided).toMatch(/\{decoding \? 'Decoding…' : 'Decode VIN'\}/);
  });

  it('reports a decode failure instead of silently continuing', () => {
    expect(guided).toMatch(/setDecodeError\(e instanceof Error \? e\.message/);
  });
});

describe('the advisor can see what came from the VIN', () => {
  it('the review names the decoded vehicle', () => {
    expect(guided).toMatch(/Decoded from VIN — \{decodedNote\}\. Those fields were not asked\./);
  });

  it('each decoded field is labelled', () => {
    // Otherwise a wrong decode is indistinguishable from something typed, and
    // there is no reason to look twice at it.
    expect(guided).toMatch(/from VIN/);
    expect(guided).toMatch(/autoFilled\.has\(x\.key as string\)/);
  });

  it('progress does not count questions that will never be shown', () => {
    expect(guided).toMatch(/const total = QUESTIONS\.length \+ 1 - autoFilled\.size/);
  });
});

/**
 * Scanning the VIN, and making the form legible in both themes.
 *
 * Typing 17 characters off a door jamb while holding a phone is where VINs get
 * mistyped, so the barcode on the sticker is read directly. It is a barcode
 * reader, not text OCR — the etched dash VIN cannot be scanned, and the UI says
 * so rather than leaving someone aiming at a windscreen.
 *
 * The theme fix is a contrast problem, not a taste one. The global palette puts
 * the card, the fields and the page within a few values of each other: in light
 * mode #ffffff, #f7f7f7 and #f0f0f0, and in dark mode --line (#1e1e2a) is all
 * but invisible against the card (#0d0d14). Fields stopped reading as fields.
 */
describe('the VIN can be scanned or photographed', () => {
  it('offers both a live scan and a photo', () => {
    expect(guided).toMatch(/📷 Scan barcode/);
    expect(guided).toMatch(/🖼 Upload photo/);
  });

  it('the photo input opens the rear camera on a phone', () => {
    expect(guided).toMatch(/accept="image\/\*" capture="environment"/);
  });

  it('the live scan asks for the rear camera too', () => {
    expect(guided).toMatch(/facingMode: 'environment'/);
  });

  it('says which VIN it can actually read', () => {
    // Pointing a barcode reader at an etched dash plate never works, and
    // without this the advisor concludes the feature is broken.
    expect(guided).toMatch(/the etched dash VIN cannot be scanned/);
  });

  it('decodes immediately on a successful scan', () => {
    expect(guided).toMatch(/void decodeVin\(vin\)/);
  });

  it('passes the scanned VIN directly rather than reading state', () => {
    // setDraft is asynchronous — reading draft here would decode the previous
    // value, which is the kind of bug that only shows on the second scan.
    expect(guided).toMatch(/const raw = \(override \?\? draft\)\.trim\(\)\.toUpperCase\(\)/);
  });

  it('releases the camera when the component goes away', () => {
    // A live stream left running drains the battery and holds the torch on.
    expect(guided).toMatch(/useEffect\(\(\) => \(\) => stopScan\(\), \[\]\)/);
  });

  it('falls back rather than dead-ending when the camera is refused', () => {
    expect(guided).toMatch(/Could not open the camera/);
  });

  it('says so on a browser without barcode support', () => {
    // iOS Safari has no BarcodeDetector; a button that silently does nothing
    // is worse than one that explains itself.
    expect(guided).toMatch(/isBarcodeScanSupported\(\)/);
    expect(guided).toMatch(/This browser cannot scan barcodes/);
  });

  it('reports a photo with no readable barcode', () => {
    expect(guided).toMatch(/No VIN barcode found in that photo/);
  });

  it('lets the same photo be picked twice', () => {
    // Clearing the input is what makes a retry after a failed read possible.
    expect(guided).toMatch(/e\.target\.value = ''; \/\/ so re-picking/);
  });
});

describe('the scanner rejects a misread before it reaches the decoder', () => {
  const scanner = read('lib/vin/scanVin.ts');

  it('excludes I, O and Q, which a VIN never contains', () => {
    // The standard omits them because they are confusable with 1 and 0, so
    // their presence means the read is wrong.
    expect(scanner).toMatch(/\[\^A-HJ-NPR-Z0-9\]/);
  });

  it('requires exactly 17 characters', () => {
    expect(scanner).toMatch(/cleaned\.length === 17 \? cleaned : null/);
  });

  it('frees the decoded image', () => {
    expect(scanner).toMatch(/bitmap\.close\?\.\(\)/);
  });

  it('is shared rather than a second copy of the logic', () => {
    expect(guided).toMatch(/from '@\/lib\/vin\/scanVin'/);
    expect(guided).not.toMatch(/new BD\(/);
  });
});

describe('fields are legible in both themes', () => {
  it('fields no longer borrow the near-invisible global tokens', () => {
    expect(guided).not.toMatch(/border: '1px solid var\(--line\)'/);
    expect(guided).not.toMatch(/background: 'var\(--surface-soft\)'/);
  });

  it('defines its own field and edge colours', () => {
    expect(guided).toMatch(/--gi-field:/);
    expect(guided).toMatch(/--gi-edge:/);
  });

  it('sets both themes explicitly, not just one', () => {
    expect(guided).toMatch(/\.gi-scope \{/);
    expect(guided).toMatch(/\[data-theme="light"\] \.gi-scope \{/);
  });

  it('the card edge is distinct from the field edge', () => {
    // A card outlined in the same weight as its inputs reads as one flat
    // block, which is the dark-mode complaint.
    expect(guided).toMatch(/--gi-card-edge:/);
    expect(guided).toMatch(/border: '1px solid var\(--gi-card-edge\)'/);
  });

  it('focus is visible without relying on colour alone', () => {
    expect(guided).toMatch(/:focus-visible/);
    expect(guided).toMatch(/box-shadow: 0 0 0 3px var\(--gi-focus\)/);
  });

  it('the scope class is actually applied', () => {
    expect(guided).toMatch(/className="gi-scope"/);
  });
});

/**
 * Not offering what the browser cannot do.
 *
 * BarcodeDetector ships in Chrome on Android, ChromeOS and macOS — not on
 * Windows or Linux, and not in Safari. A shop owner on Chrome for Windows was
 * shown both buttons, clicked Scan, and got told the browser could not do it.
 *
 * Worse, "Upload photo" used the same API and reported "No VIN barcode found
 * in that photo" — blaming the photo for a missing browser feature, which
 * sends someone off to retake pictures that were never going to work.
 *
 * Support is knowable on load, so the buttons appear only where they function.
 */
describe('scan controls appear only where they can work', () => {
  it('support is resolved after mount, not during render', () => {
    // Reading a browser API during render differs between server and client.
    expect(guided).toMatch(/useEffect\(\(\) => \{ setCanScan\(isBarcodeScanSupported\(\)\); \}, \[\]\)/);
  });

  it('the buttons render only when scanning is supported', () => {
    expect(guided).toMatch(/\{canScan === true && \(/);
  });

  it('an unsupported browser gets an explanation, not a broken button', () => {
    expect(guided).toMatch(/\{canScan === false && \(/);
    expect(guided).toMatch(/Barcode scanning is not available in this browser/);
  });

  it('nothing renders while support is still unknown', () => {
    // Tri-state on purpose: `false` and "not yet checked" are different, and
    // flashing the buttons then removing them looks like a fault.
    expect(guided).toMatch(/useState<boolean \| null>\(null\)/);
  });

  it('the photo path blames the browser, not the photo', () => {
    expect(guided).toMatch(/This browser cannot read barcodes from photos/);
  });

  it('and checks that before reading the file', () => {
    const handler = guided.slice(guided.indexOf('async function handleVinPhoto'));
    expect(handler.indexOf('isBarcodeScanSupported()'))
      .toBeLessThan(handler.indexOf('await scanVinFromFile(file)'));
  });

  it('typing the VIN is always available', () => {
    // The keyboard is the fallback on every platform, which is why the input
    // is never gated on scanner support.
    expect(guided).toMatch(/Type the VIN here/);
  });
});
