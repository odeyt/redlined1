import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Redlined1',
  description: 'Terms and conditions for using the Redlined1 platform.',
};

export default function TermsPage() {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.back}>
          <Link href="/landing-preview" style={styles.backLink}>← Redlined1</Link>
        </div>

        <h1 style={styles.h1}>Terms of Service</h1>
        <p style={styles.meta}>Effective date: 1 July 2025 · Last updated: 14 July 2025</p>

        <p style={styles.lead}>
          These Terms of Service ("Terms") govern your access to and use of Redlined1 ("the
          Service") provided by Redlined1 ("we", "us"). By creating an account or using the Service,
          you agree to these Terms. If you do not agree, do not use the Service.
        </p>

        <Section title="1. The Service">
          <p style={styles.p}>
            Redlined1 is a cloud-based shop-management platform for automotive repair businesses. It
            includes job cards, invoicing, digital vehicle inspections, parts management,
            appointments, customer records, and optional AI-powered intelligence features.
          </p>
          <p style={styles.p}>
            We may update, add, or remove features at any time. For paid plans, material reductions
            in functionality will be communicated with at least 14 days' notice.
          </p>
        </Section>

        <Section title="2. Accounts">
          <p style={styles.p}>
            You must provide accurate information when creating an account. You are responsible for
            keeping your password secure and for all activity under your account. Notify us
            immediately at{' '}
            <a href="mailto:admin@redlined1.com" style={styles.link}>admin@redlined1.com</a> if you
            suspect unauthorised access.
          </p>
          <p style={styles.p}>
            One account per natural person. You may invite team members under your shop workspace —
            each team member also agrees to these Terms.
          </p>
        </Section>

        <Section title="3. Plans and Billing">
          <p style={styles.p}>
            Redlined1 offers a free plan and paid plans billed monthly or annually. Billing is
            processed by <strong>Creem</strong>. Your subscription renews automatically unless you
            cancel before the renewal date.
          </p>
          <p style={styles.p}>
            Prices are displayed in USD. We reserve the right to change pricing with 30 days' notice.
            Price changes do not apply to your current billing period.
          </p>
          <p style={styles.p}>
            Failure to pay results in downgrade to the free plan. If the free plan limits are
            exceeded, read-only access is granted while the account is in arrears.
          </p>
        </Section>

        <Section title="4. Acceptable Use">
          <p style={styles.p}>You agree <strong>not</strong> to:</p>
          <ul style={styles.list}>
            <li>Use the Service for any unlawful purpose</li>
            <li>Reverse-engineer, decompile, or copy the platform code</li>
            <li>Attempt to gain unauthorised access to other shops' data</li>
            <li>Upload malware, spam, or content that violates others' rights</li>
            <li>Resell or sublicense access to the Service without written permission</li>
            <li>Use automated tools to scrape or overload our infrastructure</li>
          </ul>
          <p style={styles.p}>
            We may suspend or terminate accounts that violate these rules without refund.
          </p>
        </Section>

        <Section title="5. Your Data">
          <p style={styles.p}>
            You own all data you enter into Redlined1 — customer records, vehicles, jobs,
            invoices, and everything else. We do not claim any rights to it.
          </p>
          <p style={styles.p}>
            By using the Service, you grant us a limited licence to store, process, and display your
            data solely to operate and improve the platform. We do not sell your data or share it
            with third parties for advertising.
          </p>
          <p style={styles.p}>
            On account cancellation, you may export your data within 90 days. After that, it is
            permanently deleted. See our <Link href="/privacy" style={styles.link}>Privacy Policy</Link>{' '}
            for details.
          </p>
        </Section>

        <Section title="6. Uptime and Availability">
          <p style={styles.p}>
            We target 99.5% monthly uptime. Planned maintenance is communicated in advance. We do
            not guarantee uninterrupted access and are not liable for losses caused by downtime.
          </p>
          <p style={styles.p}>
            Real-time status is available at{' '}
            <a href="https://redlined1.com/status" style={styles.link}>redlined1.com/status</a>.
          </p>
        </Section>

        <Section title="7. Intellectual Property">
          <p style={styles.p}>
            The Redlined1 name, logo, software, and documentation are our intellectual property.
            Nothing in these Terms transfers ownership to you.
          </p>
          <p style={styles.p}>
            If you submit feedback or feature suggestions, you grant us the right to use them without
            obligation or compensation.
          </p>
        </Section>

        <Section title="8. Disclaimer of Warranties">
          <p style={styles.p}>
            The Service is provided <strong>"as is"</strong> without warranties of any kind, express
            or implied, including merchantability, fitness for a particular purpose, or
            non-infringement. Use at your own risk.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p style={styles.p}>
            To the maximum extent permitted by law, our total liability to you for any claim arising
            from use of the Service is limited to the amount you paid us in the <strong>3 months
            preceding the claim</strong>.
          </p>
          <p style={styles.p}>
            We are not liable for indirect, incidental, special, consequential, or punitive damages,
            including lost profits or data loss, even if advised of the possibility.
          </p>
        </Section>

        <Section title="10. Termination">
          <p style={styles.p}>
            You may cancel your account at any time from the billing settings page. Cancellation
            stops future charges; no partial-month refunds are issued unless required by the Refund
            Policy below.
          </p>
          <p style={styles.p}>
            We may terminate or suspend your account for breach of these Terms, non-payment, or
            legal obligation. We will give reasonable notice except where immediate action is
            required for security or legal reasons.
          </p>
        </Section>

        <Section title="11. Governing Law">
          <p style={styles.p}>
            These Terms are governed by the laws of Laos. Disputes will be resolved in the courts
            of Laos, without regard to conflict-of-law provisions.
          </p>
        </Section>

        <Section title="12. Changes to These Terms">
          <p style={styles.p}>
            We may revise these Terms. Material changes will be announced via in-app notice at least
            14 days before taking effect. Continued use after the effective date constitutes
            acceptance.
          </p>
        </Section>

        <Section title="13. Contact">
          <p style={styles.p}>
            <strong>Redlined1</strong><br />
            Email: <a href="mailto:admin@redlined1.com" style={styles.link}>admin@redlined1.com</a><br />
            Website: <a href="https://redlined1.com" style={styles.link}>redlined1.com</a>
          </p>
        </Section>

        <div style={styles.footer}>
          <Link href="/privacy" style={styles.link}>Privacy Policy</Link>
          {' · '}
          <Link href="/refund-policy" style={styles.link}>Refund Policy</Link>
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
  footer: {
    borderTop: '1px solid var(--line)',
    paddingTop: '2rem',
    marginTop: '3rem',
    fontSize: '0.875rem',
    color: 'var(--muted)',
  },
};
