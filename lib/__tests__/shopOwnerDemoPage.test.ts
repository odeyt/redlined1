/**
 * /shop-owner-demo — where its CTAs go, and what it may claim.
 *
 * Reads source, like shopAuditFunnel.test.ts next door. What this pins is the
 * part most likely to drift: a CTA pointed somewhere that no longer exists, a
 * demo board losing its "illustrative" label, or copy that starts promising
 * the board moves itself when it does not (features/vehicles/VehiclesView.tsx
 * changes a vehicle's status only when staff do).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const page = read('app/shop-owner-demo/page.tsx');
const tracked = read('app/shop-owner-demo/Tracked.tsx');
const board = read('app/shop-owner-demo/DemoBoard.tsx');
const video = read('app/shop-owner-demo/IntakeVideo.tsx');
const form = read('app/shop-owner-demo/WalkthroughForm.tsx');
const proxy = read('proxy.ts');
const vehiclesView = read('features/vehicles/VehiclesView.tsx');
const hero = read('components/marketing/HeroSection.tsx');

describe('the calls to action', () => {
  it('sends Start free to the real signup route', () => {
    expect(tracked).toMatch(/start_free:\s*\{\s*href:\s*'\/signup'/);
  });

  it('sends Book a walkthrough to the request form on this page', () => {
    expect(tracked).toMatch(/walkthrough:\s*\{\s*href:\s*'#book-walkthrough'/);
    expect(page).toMatch(/id="book-walkthrough"/);
  });

  it('repeats both CTAs through the page', () => {
    expect((page.match(/cta="walkthrough"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((page.match(/cta="start_free"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('is reachable without a session', () => {
    expect(proxy).toMatch(/'\/shop-owner-demo'/);
  });
});

describe('the walkthrough request reaches the owner lead workflow', () => {
  it('posts to the stored-lead endpoint, tagged with this page', () => {
    expect(form).toMatch(/fetch\('\/api\/shop-audit'/);
    expect(form).toMatch(/source: 'shop-owner-demo'/);
  });

  it('carries the honeypot the endpoint checks', () => {
    expect(form).toMatch(/name="website"/);
    expect(form).toMatch(/tabIndex=\{-1\}/);
  });
});

describe('analytics', () => {
  it.each([
    ['page view', page, /<PageViewEvent \/>/],
    ['CTA clicks', tracked, /book_walkthrough_click/],
    ['signup click', tracked, /start_free_click/],
    ['video play', video, /trackEvent\('video_play'/],
    ['lead submission', form, /trackEvent\('generate_lead'/],
  ])('tracks %s', (_label, source, pattern) => {
    expect(source).toMatch(pattern);
  });
});

describe('honest demonstration', () => {
  it('labels the demo board as illustrative', () => {
    expect(board).toMatch(/Illustrative demo data/);
  });

  it('never shows a VIN on the demo board', () => {
    expect(board).not.toMatch(/\bvin\s*:/i);
    expect(board).not.toMatch(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  });

  it('uses the real board column names', () => {
    for (const label of ['Pending Customer Approval', 'Pending Parts', 'Work In Progress', 'Completed']) {
      expect(vehiclesView).toContain(`label: '${label}'`);
      expect(board).toContain(`label: '${label}'`);
    }
  });

  it('says staff move cards, and never that the board updates itself', () => {
    expect(page).toMatch(/Staff move the card as work progresses/);
    expect(page).not.toMatch(/automatic(ally)? (update|move|sync)/i);
    expect(page).not.toMatch(/updates? (itself|automatically|in real[- ]time)/i);
  });

  it('uses only the approved demo video, labelled as the intake demo', () => {
    const approved = hero.match(/youtu\.be\/([\w-]{11})/)?.[1];
    expect(approved).toBeTruthy();
    expect(video).toContain(`INTAKE_VIDEO_ID = '${approved}'`);
    expect(video).toMatch(/Vehicle Intake demo/);
  });

  it('invents no social proof', () => {
    const copy = page + board;
    expect(copy).not.toMatch(/testimonial|trusted by|\d[\d,]*\+? (shops|customers)|save \$?\d/i);
  });
});
