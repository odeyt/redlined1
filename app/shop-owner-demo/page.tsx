import type { Metadata } from 'next';
import Link from 'next/link';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { CtaLink, PageViewEvent } from './Tracked';
import { DemoBoard } from './DemoBoard';
import { IntakeVideo } from './IntakeVideo';
import { WalkthroughForm } from './WalkthroughForm';
import './shop-owner-demo.css';

/**
 * /shop-owner-demo — landing page for US independent repair-shop owners.
 *
 * Every product claim here is something the app does today, checked against
 * the source:
 *
 *  - The board is Vehicle Management's Kanban view
 *    (features/vehicles/VehiclesView.tsx). Its columns include Pending
 *    Customer Approval, Pending Parts and Work In Progress, each with a count.
 *  - Cards move when staff move them: drag to a column, the card's "Move to…"
 *    menu, or the status buttons on the vehicle record. Nothing moves a card
 *    because a repair order changed, so the page never says it does.
 *  - Cards show the technicians assigned on the vehicle record (more than one
 *    is allowed).
 *  - Completing Vehicle Intake creates the customer and vehicle records
 *    (features/triage/TriageView.tsx, ensureCustomerAndVehicle).
 *
 * "Book a walkthrough" jumps to the request form on this page, which feeds the
 * existing owner lead workflow (/api/shop-audit → shop_audit_leads + email).
 * "Start free" goes to /signup.
 */

const PAGE_URL = 'https://www.redlined1.com/shop-owner-demo';
const TITLE = 'See Every Vehicle in Your Shop at a Glance | RedlineD1';
const DESCRIPTION =
  'One board for your repair shop: which vehicles need customer approval, which are waiting for parts, and which technician is on each job. Book a walkthrough or start free.';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.redlined1.com'),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    siteName: 'RedlineD1',
    title: 'See every vehicle in your shop — and what it’s waiting on',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'See every vehicle in your shop — and what it’s waiting on',
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

const FOCUS_AREAS = [
  {
    id: 'approvals',
    eyebrow: 'Approvals needed',
    title: 'Know which cars are waiting on a customer’s yes.',
    body: 'Vehicles waiting for a decision sit in their own Pending Customer Approval column, with a count at the top. When the customer approves, staff move the card to Work In Progress.',
  },
  {
    id: 'parts',
    eyebrow: 'Waiting for parts',
    title: 'See what’s stalled on parts, not on people.',
    body: 'A Pending Parts column keeps parts-held vehicles separate from active work, so a car waiting on a delivery doesn’t look like a car nobody is working on. When the parts arrive, the card moves back to Work In Progress.',
  },
  {
    id: 'technicians',
    eyebrow: 'Technician workload',
    title: 'See who is on which car.',
    body: 'Each card shows the technicians assigned to that vehicle — one or several — so you can see at a glance who is carrying which jobs before you hand out the next one.',
  },
];

const STEPS = [
  {
    title: 'Check the vehicle in',
    body: 'Completing Vehicle Intake creates the customer and vehicle records, so the car is in Vehicle Management from the start.',
  },
  {
    title: 'Assign technicians',
    body: 'Pick one or more technicians on the vehicle record. Their names appear on the vehicle’s board card.',
  },
  {
    title: 'Staff move the card as work progresses',
    body: 'Your team drags the card to the next column — or uses the card’s “Move to…” menu — when a customer is asked for approval, parts are ordered, or work starts. The board shows what your team sets; it does not move cards on its own.',
  },
  {
    title: 'You check one screen',
    body: 'Open Vehicle Management and switch to the Kanban view to see approvals, parts holds and work in progress across the shop.',
  },
];

export default function ShopOwnerDemoPage() {
  return (
    <div className="sod-page">
      <PageViewEvent />
      <a href="#main" className="sod-skip">Skip to main content</a>

      <header className="sod-nav">
        <div className="sod-wrap sod-nav-inner">
          <Link href="/" aria-label="RedlineD1 home" className="sod-nav-logo">
            <RedlineD1Logo height={32} background="light" />
          </Link>
          <nav aria-label="Get started" className="sod-nav-ctas">
            <CtaLink cta="start_free" location="nav" className="sod-btn sod-btn-ghost sod-nav-free">Start free</CtaLink>
            <CtaLink cta="walkthrough" location="nav" className="sod-btn sod-btn-primary">Book a walkthrough</CtaLink>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="sod-hero" aria-labelledby="sod-hero-title">
          <div className="sod-wrap sod-hero-grid">
            <div className="sod-hero-copy">
              <p className="sod-eyebrow">For independent auto repair shop owners</p>
              <h1 id="sod-hero-title">See every vehicle in your shop — and what it’s waiting on.</h1>
              <p className="sod-lede">
                RedlineD1’s vehicle board shows which cars need customer approval, which are waiting for parts,
                and which technician is on each job, in one view your team keeps current.
              </p>
              <div className="sod-cta-row">
                <CtaLink cta="walkthrough" location="hero" className="sod-btn sod-btn-primary sod-btn-lg">Book a walkthrough</CtaLink>
                <CtaLink cta="start_free" location="hero" className="sod-btn sod-btn-secondary sod-btn-lg">Start free</CtaLink>
              </div>
              <p className="sod-muted sod-small">Start free with no card required.</p>
            </div>
            <DemoBoard />
          </div>
        </section>

        <section className="sod-section" aria-labelledby="sod-focus-title">
          <div className="sod-wrap">
            <h2 id="sod-focus-title" className="sod-h2">Three questions the board answers</h2>
            <div className="sod-focus-grid">
              {FOCUS_AREAS.map(area => (
                <article key={area.id} className={`sod-focus sod-focus-${area.id}`}>
                  <p className="sod-eyebrow">{area.eyebrow}</p>
                  <h3>{area.title}</h3>
                  <p>{area.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sod-section sod-section-alt" aria-labelledby="sod-how-title">
          <div className="sod-wrap sod-how-grid">
            <div>
              <h2 id="sod-how-title" className="sod-h2">How it works</h2>
              <ol className="sod-steps">
                {STEPS.map((step, i) => (
                  <li key={step.title}>
                    <span className="sod-step-num" aria-hidden="true">{i + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="sod-cta-row">
                <CtaLink cta="walkthrough" location="how_it_works" className="sod-btn sod-btn-primary">Book a walkthrough</CtaLink>
                <CtaLink cta="start_free" location="how_it_works" className="sod-btn sod-btn-secondary">Start free</CtaLink>
              </div>
            </div>
            <IntakeVideo />
          </div>
        </section>

        <section id="book-walkthrough" className="sod-section sod-book" aria-labelledby="sod-book-title" tabIndex={-1}>
          <div className="sod-wrap sod-book-grid">
            <div className="sod-book-copy">
              <h2 id="sod-book-title" className="sod-h2">Book a walkthrough</h2>
              <p>
                Tell us how to reach you and we’ll set up a time to walk through the vehicle board, intake and job
                cards with your own questions in mind.
              </p>
              <p>
                Prefer to try it yourself?{' '}
                <CtaLink cta="start_free" location="book_section" className="sod-link">Start free</CtaLink>
                {' '}— no card required.
              </p>
            </div>
            <div className="sod-book-card">
              <WalkthroughForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="sod-footer">
        <div className="sod-wrap sod-footer-inner">
          <span>© RedlineD1</span>
          <nav aria-label="Legal" className="sod-footer-links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
