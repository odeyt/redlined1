/**
 * The two conversion paths, and the promise attached to each.
 *
 * Two things had drifted apart and this pins them together. The pricing page
 * listed "Full platform access" as a Free Forever feature, which the plan gate
 * contradicts on day eight — getPlanStatus() drops an expired trial to 'free'
 * and canAccess() then allows FREE_MODULES only. And the only assisted-sales
 * route was /contact-sales, an email-only form that stored nothing.
 *
 * These read source rather than rendering, matching signupCopy.test.ts next
 * door. That is weaker than a render test, but it pins the two things that
 * actually regressed: the wording of the offer, and where each CTA points.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const hero = read('components/marketing/HeroSection.tsx');
const pricing = read('components/marketing/PricingSection.tsx');
const faq = read('components/marketing/FAQSection.tsx');
const header = read('components/marketing/MarketingHeader.tsx');
const finalCta = read('components/marketing/FinalCTA.tsx');
const signup = read('app/signup/page.tsx');
const auditPage = read('app/shop-audit/page.tsx');
const auditForm = read('app/shop-audit/ShopAuditForm.tsx');
const auditApi = read('app/api/shop-audit/route.ts');
const migration = read('supabase/migrations/2026-09-13_shop_audit_leads.sql');

describe('the homepage offers both paths', () => {
  it('renders Start Free and Book a Shop Audit in the hero', () => {
    expect(hero).toMatch(/Start Free/);
    expect(hero).toMatch(/Book a Shop Audit/);
  });

  it('sends Start Free to the canonical signup route', () => {
    expect(hero).toMatch(/href="\/signup"/);
  });

  it('sends Book a Shop Audit to /shop-audit', () => {
    expect(hero).toMatch(/href="\/shop-audit"/);
  });

  it('keeps the audit CTA reachable from nav, pricing and the closing CTA', () => {
    expect(header).toMatch(/href="\/shop-audit"/);
    expect(pricing).toMatch(/href="\/shop-audit"/);
    expect(finalCta).toMatch(/href="\/shop-audit"/);
  });

  it('does not strip the contextual CTA that was already there', () => {
    // "See How It Works" serves a different intent than either funnel and was
    // deliberately kept rather than replaced.
    expect(hero).toMatch(/See How It Works/);
  });
});

describe('the offer is explained the same way everywhere', () => {
  it('the hero says what happens after the seven days', () => {
    expect(hero).toMatch(/seven days/i);
    expect(hero).toMatch(/keep the Free plan or upgrade/i);
  });

  it('signup states the trial length, the card, and the plan afterwards', () => {
    expect(signup).toMatch(/Try every feature for \$\{TRIAL_DAYS\} days/);
    expect(signup).toMatch(/No card required/i);
    expect(signup).toMatch(/keep the Free plan or upgrade/i);
  });

  it('signup never implies the account itself disappears', () => {
    expect(signup).not.toMatch(/account (will )?(expire|be deleted|close)/i);
    expect(signup).not.toMatch(/trial ends.{0,40}lose (your )?access/i);
  });

  it('pricing explains the trial rather than leaving Free Forever bare', () => {
    expect(pricing).toMatch(/seven days of full access/i);
    expect(pricing).toMatch(/keep the Free plan or upgrade/i);
  });

  it('the FAQ answer about cards matches the same offer', () => {
    expect(faq).toMatch(/seven days of full access/i);
  });
});

describe('the free plan is not sold as something it is not', () => {
  it('no longer lists full platform access as a Free Forever feature', () => {
    // canAccess() gives a free shop FREE_MODULES only. Parts, reports and
    // employees are not in that set, so this bullet was untrue from day eight.
    const freeCard = pricing.slice(pricing.indexOf("key: 'free'"), pricing.indexOf("key: 'solo'"));
    expect(freeCard).not.toMatch(/'Full platform access',/);
    expect(freeCard).toMatch(/7 days of full access to start/);
  });

  it('the hero trust badges no longer claim unqualified full access', () => {
    expect(hero).not.toMatch(/'Full platform access',/);
    expect(hero).toMatch(/7 days of full access/);
  });
});

describe('the shop audit page', () => {
  it('has metadata and exactly one h1', () => {
    expect(auditPage).toMatch(/export const metadata/);
    expect((auditPage.match(/<h1/g) ?? []).length).toBe(1);
  });

  it('sets expectations instead of promising revenue', () => {
    expect(auditPage + auditForm).toMatch(/workflow consultation, not a guaranteed-revenue offer/i);
  });

  it('asks for the qualifying fields and nothing sensitive', () => {
    for (const id of [
      'fullName', 'email', 'phone', 'shopName', 'country',
      'locationCount', 'technicianCount', 'monthlyVehicleVolume',
      'currentSoftware', 'biggestChallenge', 'preferredContactMethod', 'preferredTime',
    ]) {
      expect(auditForm).toContain(`htmlFor="${id}"`);
    }
    expect(auditForm).not.toMatch(/card number|cvv|vin\b/i);
  });

  it('requires consent and links the privacy policy', () => {
    expect(auditForm).toMatch(/htmlFor="consent"/);
    expect(auditForm).toMatch(/href="\/privacy"/);
  });

  it('guards against a double submission rather than relying on the disabled attribute', () => {
    expect(auditForm).toMatch(/if \(status !== 'idle'\) return;/);
  });

  it('moves focus to the error and to the confirmation', () => {
    expect(auditForm).toMatch(/errorRef\.current\?\.focus\(\)/);
    expect(auditForm).toMatch(/successRef\.current\?\.focus\(\)/);
    expect(auditForm).toMatch(/role="alert"/);
  });

  it('does not invent an external booking provider', () => {
    // Naming a provider in a comment that explains why we did not link one
    // is fine; a real outbound booking URL is not.
    const bookingUrl = new RegExp('https?://[^\\s"\']*(calendly|cal\\.com|hubspot)', 'i');
    expect(bookingUrl.test(auditPage + auditForm)).toBe(false);
  });
});

describe('the funnel is reachable without an account', () => {
  it('the page and its endpoint are public, like /contact-sales', () => {
    // Without this the proxy bounces an anonymous visitor to /login, which
    // makes the CTA a dead end for exactly the people it targets.
    const proxy = read('proxy.ts');
    expect(proxy).toMatch(/'\/shop-audit'/);
    expect(proxy).toMatch(/'\/api\/shop-audit'/);
  });
});

describe('audit leads are stored safely', () => {
  it('validates name and email server-side before storing', () => {
    expect(auditApi).toMatch(/Your name is required/);
    expect(auditApi).toMatch(/Enter a valid work email address/);
  });

  it('rate-limits by IP, like the other public endpoint', () => {
    expect(auditApi).toMatch(/isRateLimited/);
    expect(auditApi).toMatch(/status: 429/);
  });

  it('writes with the service role, never the browser key', () => {
    expect(auditApi).toMatch(/getAdminDb/);
    expect(auditApi).not.toMatch(/SERVICE_ROLE|anon key/i);
  });

  it('treats the stored row as the deliverable and the email as best-effort', () => {
    // A Resend outage must not lose a lead that is already in the table.
    const notifyIdx = auditApi.indexOf('notify failed');
    const storeIdx = auditApi.indexOf('store failed');
    expect(storeIdx).toBeGreaterThan(-1);
    expect(notifyIdx).toBeGreaterThan(storeIdx);
    expect(auditApi).toMatch(/ok: true/);
  });

  it('caps every free-text field and bounds every number', () => {
    expect(auditApi).toMatch(/function text\(value: unknown, max: number\)/);
    expect(auditApi).toMatch(/function count\(value: unknown, max: number\)/);
  });

  it('locks the table to the service role — anonymous visitors cannot read leads', () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/REVOKE ALL ON public\.shop_audit_leads FROM anon, authenticated/);
    // An anon INSERT policy would let PostgREST take writes directly, bypassing
    // the route's validation and rate limit.
    expect(migration).not.toMatch(/CREATE POLICY/);
  });
});

describe('analytics carry attribution but never the form contents', () => {
  it('marks both CTAs with the events and their location', () => {
    expect(hero).toMatch(/data-analytics="start_free_clicked"/);
    expect(hero).toMatch(/data-analytics="shop_audit_clicked"/);
    expect(hero).toMatch(/data-cta-location="hero"/);
  });

  it('marks the audit form start and submission', () => {
    expect(auditForm).toMatch(/data-analytics="shop_audit_started"/);
    expect(auditForm).toMatch(/data-analytics="shop_audit_submitted"/);
  });

  it('never puts a field value into an analytics attribute', () => {
    // data-analytics values must stay literal strings — an interpolated one
    // would ship whatever the visitor typed into the attribute.
    const analytics = auditForm.match(/data-analytics=\{[^}]*\}/g) ?? [];
    expect(analytics).toEqual([]);
  });
});
