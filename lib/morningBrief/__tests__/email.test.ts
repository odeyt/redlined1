/**
 * The morning-brief email: the subject shape Odey approved, the cited
 * figures carried through verbatim from the deterministic brief, and the
 * required footer. The brief text is built by lib/redline-ai's own
 * builders from hand-made facts, so what is asserted here is what a
 * shop owner would actually read.
 */
import { buildMorningBriefAnswer, type MorningBriefFacts } from '@/lib/redline-ai/answers';
import { renderMorningBriefEmail } from '../email';

const FACTS: MorningBriefFacts = {
  openJobs: [{
    id: 'job-1', ro: 'JC-100', customerName: 'Sam Reyes', vehicleLabel: '2019 F-150',
    serviceType: 'Brakes', status: 'In Progress', checkInDate: '2026-11-10', ageDays: 13,
  }],
  awaitingEstimates: [{
    id: 'est-1', number: 'EST-0042', status: 'Sent', customerName: 'K. Vongsa',
    vehicleLabel: '2018 Camry', total: 450, currency: 'USD', sentAt: '2026-11-01',
    createdAt: '2026-11-01', ageDays: 22, awaitingReply: true, stale: true,
  }],
  owedGroups: [{
    customerName: 'Dana Cole',
    invoices: [{
      invoiceNumber: 'INV-0201', customerName: 'Dana Cole', vehicleLabel: '2020 Civic',
      currency: 'USD', total: 200, paid: 0, balance: 200, dueDate: '2026-11-01',
      daysOverdue: 22, status: 'Sent',
    }],
    totalsByCurrency: { USD: 200 },
    oldestDueDate: '2026-11-01',
    maxDaysOverdue: 22,
  }],
};

const BRIEF = buildMorningBriefAnswer(FACTS, '2026-11-23');

function render(shopName = 'D1 Imports') {
  return renderMorningBriefEmail({
    shopName,
    localDate: '2026-11-23',
    briefText: BRIEF,
    appUrl: 'https://www.redlined1.com',
  });
}

describe('renderMorningBriefEmail', () => {
  it('subject is "Your morning brief — <Shop Name> — <local date>"', () => {
    expect(render().subject).toBe('Your morning brief — D1 Imports — 2026-11-23');
  });

  it('carries the brief\'s cited figures into text and HTML', () => {
    const email = render();
    for (const body of [email.text, email.html]) {
      expect(body).toContain('INV-0201'); // the chased invoice, cited
      expect(body).toContain('EST-0042'); // the stale estimate, cited
      expect(body).toContain('JC-100'); // the stuck job, cited
      expect(body).toContain('USD 200.00');
      expect(body).toContain('1 open job');
      expect(body).toContain('1 stale estimate');
      expect(body).toContain('1 unpaid invoice, 1 overdue');
    }
  });

  it('links to the app and carries the RedlineD1 footer in both bodies', () => {
    const email = render();
    expect(email.text).toContain('Open Redline AI: https://www.redlined1.com');
    expect(email.text).toContain('D1 Imports · Redline AI by RedlineD1');
    expect(email.html).toContain('href="https://www.redlined1.com"');
    expect(email.html).toContain('D1 Imports · Redline AI by RedlineD1');
  });

  it('escapes a shop name with HTML in it', () => {
    const email = render('A & B <Auto> "Care"');
    expect(email.html).not.toContain('<Auto>');
    expect(email.html).toContain('A &amp; B &lt;Auto&gt; &quot;Care&quot;');
    // The subject and text keep the name as-is — escaping is HTML-only.
    expect(email.subject).toContain('A & B <Auto> "Care"');
  });

  it('does not repeat the "Morning brief for <date>" line in the HTML body', () => {
    const email = render();
    expect(email.html).not.toContain('Morning brief for 2026-11-23:');
    // …but the plain-text body keeps the brief exactly as built.
    expect(email.text).toContain('Morning brief for 2026-11-23:');
  });
});
