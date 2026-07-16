import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Redlined1',
  description: 'How Redlined1 collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.back}>
          <Link href="/" style={styles.backLink}>← Redlined1</Link>
        </div>

        <h1 style={styles.h1}>Privacy Policy</h1>
        <p style={styles.meta}>Effective date: 1 July 2025 · Last updated: 14 July 2025</p>

        <p style={styles.lead}>
          Redlined1 ("we", "us", or "our") operates the Redlined1 shop-management platform at{' '}
          <strong>redlined1.com</strong>. This policy explains what data we collect, why we collect it,
          how we use it, and your rights. We keep it plain English — no legalese traps.
        </p>

        <Section title="1. Who We Are">
          <p>
            Redlined1 is a software-as-a-service (SaaS) product built for automotive repair shops. We are
            registered in Laos. Questions? Email us at{' '}
            <a href="mailto:admin@redlined1.com" style={styles.link}>admin@redlined1.com</a>.
          </p>
        </Section>

        <Section title="2. Data We Collect">
          <SubSection label="2.1 Account data">
            Email address, name, and password hash when you sign up. We use Supabase Auth — your
            password is never stored in plain text.
          </SubSection>
          <SubSection label="2.2 Shop data you enter">
            Customer records, vehicle records, job cards, invoices, estimates, inspection results,
            parts orders, and any other content you create inside the app. This data belongs to you.
          </SubSection>
          <SubSection label="2.3 Usage and device data">
            Pages visited, features used, browser type, operating system, and approximate location
            (country/city derived from IP). We use this to improve the product. We do not sell it.
          </SubSection>
          <SubSection label="2.4 Payment data">
            Billing is handled by <strong>Creem</strong>. We never see or store your full card number.
            Creem shares only subscription status, plan tier, and transaction IDs with us.
          </SubSection>
          <SubSection label="2.5 Communications">
            If you email us for support we keep the thread to resolve your issue and improve our
            documentation.
          </SubSection>
        </Section>

        <Section title="3. How We Use Your Data">
          <ul style={styles.list}>
            <li>Provide, maintain, and improve the Redlined1 platform</li>
            <li>Authenticate your account and keep it secure</li>
            <li>Process subscription payments via Creem</li>
            <li>Send essential service emails (password reset, billing receipts, downtime notices)</li>
            <li>Analyse aggregate, anonymised usage to prioritise features</li>
            <li>Comply with legal obligations</li>
          </ul>
          <p>We do <strong>not</strong> use your data to train AI models, sell to advertisers, or share
          with third parties for their marketing.</p>
        </Section>

        <Section title="4. Data Storage and Security">
          <p>
            Your data is stored on <strong>Supabase</strong> infrastructure hosted on AWS (Singapore
            region). Data is encrypted in transit (TLS 1.2+) and at rest (AES-256). We apply
            row-level security policies so shop data is isolated between accounts.
          </p>
          <p>
            We perform regular backups. No system is 100% secure — if we ever discover a breach that
            affects your data, we will notify you within 72 hours.
          </p>
        </Section>

        <Section title="5. Cookies and Tracking">
          <p>
            We use strictly necessary session cookies to keep you logged in. We use Google Analytics
            (anonymised IP) to understand aggregate traffic. We do not use advertising cookies or
            cross-site tracking pixels.
          </p>
          <p>
            You can disable analytics cookies in your browser settings without losing any app
            functionality.
          </p>
        </Section>

        <Section title="6. Third-Party Services">
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Service</th>
                <th style={styles.th}>Purpose</th>
                <th style={styles.th}>Data shared</th>
              </tr>
            </thead>
            <tbody>
              <TableRow cells={['Supabase', 'Database & auth', 'All shop and account data']} />
              <TableRow cells={['Creem', 'Payment processing', 'Email, subscription plan']} />
              <TableRow cells={['Vercel', 'App hosting & CDN', 'Request logs, IP addresses']} />
              <TableRow cells={['Google Analytics', 'Usage analytics', 'Anonymised page views']} />
            </tbody>
          </table>
        </Section>

        <Section title="7. Data Retention">
          <p>
            We keep your account and shop data for as long as your account is active. If you cancel,
            we retain data for <strong>90 days</strong> so you can export it, then delete it.
            Billing records are kept for 7 years as required by tax law.
          </p>
        </Section>

        <Section title="8. Your Rights">
          <ul style={styles.list}>
            <li><strong>Access</strong> — request a copy of all data we hold about you</li>
            <li><strong>Correction</strong> — update incorrect personal data</li>
            <li><strong>Deletion</strong> — ask us to delete your account and all associated data</li>
            <li><strong>Export</strong> — download your shop data in CSV format from the app settings</li>
            <li><strong>Opt-out</strong> — unsubscribe from non-essential emails at any time</li>
          </ul>
          <p>
            To exercise any right, email{' '}
            <a href="mailto:admin@redlined1.com" style={styles.link}>admin@redlined1.com</a>. We will
            respond within 30 days.
          </p>
        </Section>

        <Section title="9. Children">
          <p>
            Redlined1 is not directed at anyone under 18. We do not knowingly collect data from
            minors. If you believe a minor has created an account, contact us and we will delete it.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this policy as the product evolves. Material changes will be announced via
            in-app notice at least 14 days before taking effect. The "Last updated" date at the top
            always reflects the current version.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            <strong>Redlined1</strong><br />
            Email: <a href="mailto:admin@redlined1.com" style={styles.link}>admin@redlined1.com</a><br />
            Website: <a href="https://redlined1.com" style={styles.link}>redlined1.com</a>
          </p>
        </Section>

        <div style={styles.footer}>
          <Link href="/terms" style={styles.link}>Terms of Service</Link>
          {' · '}
          <Link href="/refund-policy" style={styles.link}>Refund Policy</Link>
          {' · '}
          <Link href="/" style={styles.link}>Back to Home</Link>
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

function SubSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p style={styles.p}>
      <strong>{label}: </strong>{children}
    </p>
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
    color: 'var(--text)',
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
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
    marginBottom: '0.875rem',
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
