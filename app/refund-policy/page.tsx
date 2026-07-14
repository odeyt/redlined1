import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy — Redlined1',
  description: 'Redlined1 subscription refund and cancellation policy.',
};

export default function RefundPolicyPage() {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.back}>
          <Link href="/landing-preview" style={styles.backLink}>← Redlined1</Link>
        </div>

        <h1 style={styles.h1}>Refund Policy</h1>
        <p style={styles.meta}>Effective date: 1 July 2025 · Last updated: 14 July 2025</p>

        <p style={styles.lead}>
          We want you to be confident trying Redlined1. This policy explains exactly when you can
          get your money back — no ambiguity.
        </p>

        <Section title="1. Free Trial">
          <p style={styles.p}>
            All paid plans start with a <strong>7-day free trial</strong>. No credit card is required
            to start a trial. You are only charged when the trial ends and you choose to continue.
            Cancel during the trial and you owe nothing.
          </p>
        </Section>

        <Section title="2. Monthly Plans — Cancellation">
          <p style={styles.p}>
            Monthly subscriptions can be cancelled at any time. Cancellation takes effect at the end
            of the current billing period. <strong>We do not issue refunds for partial months</strong>{' '}
            — you retain full access until the period ends.
          </p>
          <p style={styles.p}>
            Example: you are billed on the 1st of each month. You cancel on the 15th. You keep
            access until the end of that month and are not charged again.
          </p>
        </Section>

        <Section title="3. Annual Plans — Cancellation and Refund Window">
          <p style={styles.p}>
            Annual subscriptions are billed upfront for 12 months at a discounted rate. If you cancel
            within <strong>14 days of the annual billing date</strong>, we will issue a full refund,
            no questions asked.
          </p>
          <p style={styles.p}>
            After 14 days, annual plans are non-refundable. You retain access for the remainder of
            the paid year.
          </p>
        </Section>

        <Section title="4. Exceptional Circumstances">
          <p style={styles.p}>
            We will consider refund requests outside the windows above in the following situations:
          </p>
          <ul style={styles.list}>
            <li>
              <strong>Billing error</strong> — if you were charged the wrong amount or charged after
              cancellation, we will correct it immediately.
            </li>
            <li>
              <strong>Extended outage</strong> — if Redlined1 experienced an outage exceeding 72
              consecutive hours that was our fault, we will credit or refund a pro-rated amount for
              the affected period.
            </li>
            <li>
              <strong>Duplicate charge</strong> — if you were charged twice for the same period due
              to a payment system error, the duplicate will be refunded.
            </li>
          </ul>
          <p style={styles.p}>
            For all exceptional requests, email{' '}
            <a href="mailto:admin@redlined1.com" style={styles.link}>admin@redlined1.com</a> with
            your account email and a description of the issue. We respond within 2 business days.
          </p>
        </Section>

        <Section title="5. How Refunds Are Processed">
          <p style={styles.p}>
            Approved refunds are returned to the original payment method via Creem, our payment
            processor. Processing time is typically <strong>5–10 business days</strong> depending on
            your bank or card issuer. We cannot accelerate this timeline.
          </p>
        </Section>

        <Section title="6. Plan Downgrades">
          <p style={styles.p}>
            Downgrading from a higher plan to a lower plan (or to the free plan) is not treated as
            a cancellation and does not trigger a refund. The lower plan takes effect at the start
            of your next billing period.
          </p>
        </Section>

        <Section title="7. Free Plan">
          <p style={styles.p}>
            The free plan has no charge, so there is nothing to refund. There is no time limit on
            the free plan — you can use it indefinitely within its feature limits.
          </p>
        </Section>

        <Section title="8. Contact">
          <p style={styles.p}>
            Refund questions? We are here to help.
          </p>
          <p style={styles.p}>
            <strong>Redlined1</strong><br />
            Email: <a href="mailto:admin@redlined1.com" style={styles.link}>admin@redlined1.com</a><br />
            Response time: within 2 business days
          </p>
        </Section>

        <div style={styles.summary}>
          <h3 style={styles.summaryTitle}>Quick Reference</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Situation</th>
                <th style={styles.th}>Refund</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={['Cancel during 7-day free trial', 'Full refund (no charge taken)']} />
              <TableRow cells={['Cancel monthly plan mid-period', 'No refund — access until period end']} />
              <TableRow cells={['Cancel annual plan within 14 days', 'Full refund']} />
              <TableRow cells={['Cancel annual plan after 14 days', 'No refund — access until year end']} />
              <TableRow cells={['Billing error or duplicate charge', 'Full correction']} />
              <TableRow cells={['Outage >72 hours (our fault)', 'Pro-rated credit or refund']} />
            </tbody>
          </table>
        </div>

        <div style={styles.footer}>
          <Link href="/privacy" style={styles.link}>Privacy Policy</Link>
          {' · '}
          <Link href="/terms" style={styles.link}>Terms of Service</Link>
          {' · '}
          <Link href="/landing-preview" style={styles.link}>Back to Home</Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>{title}</h2>
      {children}
    </section>
  );
}

function TableRow({ cells }: { cells: string[] }) {
  return (
    <tr>
      {cells.map((c, i) => <td key={i} style={styles.td}>{c}</td>)}
    </tr>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)',
    padding: '2rem 1rem 4rem',
  },
  container: {
    maxWidth: 760,
    margin: '0 auto',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    textTransform: 'none',
  },
  back: { marginBottom: '1.5rem' },
  backLink: {
    color: 'var(--accent)',
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  h1: {
    fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    margin: '0 0 0.5rem',
    textTransform: 'uppercase',
  },
  meta: {
    fontSize: '0.8125rem',
    color: 'var(--muted)',
    marginBottom: '2rem',
  },
  lead: {
    fontSize: '1.0625rem',
    lineHeight: 1.7,
    marginBottom: '2rem',
  },
  section: {
    borderTop: '1px solid var(--line)',
    paddingTop: '1.75rem',
    marginTop: '1.75rem',
  },
  h2: {
    fontSize: '1.125rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
    marginBottom: '0.875rem',
    textTransform: 'uppercase',
  },
  p: {
    fontSize: '0.9375rem',
    lineHeight: 1.7,
    marginBottom: '0.875rem',
  },
  list: {
    paddingLeft: '1.25rem',
    lineHeight: 1.8,
    fontSize: '0.9375rem',
    marginBottom: '0.875rem',
  },
  link: { color: 'var(--accent)', textDecoration: 'underline' },
  summary: {
    borderTop: '1px solid var(--line)',
    paddingTop: '1.75rem',
    marginTop: '1.75rem',
  },
  summaryTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '1rem',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    borderBottom: '2px solid var(--line)',
    fontWeight: 700,
    textTransform: 'uppercase',
    fontSize: '0.75rem',
    letterSpacing: '0.06em',
    color: 'var(--muted)',
  },
  td: {
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid var(--line)',
    lineHeight: 1.5,
  },
  footer: {
    borderTop: '1px solid var(--line)',
    paddingTop: '2rem',
    marginTop: '3rem',
    fontSize: '0.875rem',
    color: 'var(--muted)',
  },
};
