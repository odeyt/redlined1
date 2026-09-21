import {
  SUPPORT_OVERDUE_DAYS, ageInDays, filterSupportItems, isConfirmedNoise, isOpen, isOverdue, leadTriage,
  needsAttention, sanitizeSupportView, summarizeSupport, ticketTriage, waitingSince, type TriagedItem,
} from '../supportTriage';

const DAY = 86400000;

function item(o: Partial<TriagedItem>): TriagedItem {
  return { source: 'support_ticket', status: 'open', triage: 'unreviewed', open: true, needsAttention: true, ageDays: 0, overdue: false, ...o };
}

describe('triage classification — only explicit markers confirm test or spam', () => {
  it('ticket triage accepts only the three markers; anything else is unreviewed', () => {
    expect(ticketTriage('real')).toBe('real');
    expect(ticketTriage('test')).toBe('test');
    expect(ticketTriage('spam')).toBe('spam');
    for (const other of [null, undefined, '', 'TEST', 'looks like spam', 'bug']) expect(ticketTriage(other as string | null)).toBe('unreviewed');
  });

  it('lead triage: spam is confirmed, "new" is unreviewed, an engaged lead is real', () => {
    expect(leadTriage('spam')).toBe('spam');
    expect(leadTriage('new')).toBe('unreviewed');
    expect(leadTriage(null)).toBe('unreviewed');
    for (const s of ['contacted', 'qualified', 'scheduled', 'won', 'lost']) expect(leadTriage(s)).toBe('real');
  });

  it('only test and spam count as confirmed noise', () => {
    expect(isConfirmedNoise('test')).toBe(true);
    expect(isConfirmedNoise('spam')).toBe(true);
    expect(isConfirmedNoise('real')).toBe(false);
    expect(isConfirmedNoise('unreviewed')).toBe(false);
  });
});

describe('open / needs attention / overdue predicates', () => {
  it('a ticket is open unless closed; a lead is open until won, lost or spam', () => {
    expect(isOpen('support_ticket', 'open')).toBe(true);
    expect(isOpen('support_ticket', 'answered')).toBe(true);
    expect(isOpen('support_ticket', 'closed')).toBe(false);
    for (const s of ['new', 'contacted', 'qualified', 'scheduled']) expect(isOpen('shop_audit_lead', s)).toBe(true);
    for (const s of ['won', 'lost', 'spam']) expect(isOpen('shop_audit_lead', s)).toBe(false);
  });

  it('a ticket needs attention when open and the latest message is not from support', () => {
    expect(needsAttention('support_ticket', 'open', 'unreviewed', 'customer')).toBe(true);
    expect(needsAttention('support_ticket', 'open', 'unreviewed', null)).toBe(true);
    expect(needsAttention('support_ticket', 'open', 'unreviewed', 'ai')).toBe(true);
    expect(needsAttention('support_ticket', 'answered', 'unreviewed', 'support')).toBe(false);
    expect(needsAttention('support_ticket', 'closed', 'unreviewed', 'customer')).toBe(false);
  });

  it('a lead needs attention only while "new"', () => {
    expect(needsAttention('shop_audit_lead', 'new', 'unreviewed', null)).toBe(true);
    expect(needsAttention('shop_audit_lead', 'contacted', 'real', null)).toBe(false);
  });

  it('a confirmed test or spam record never needs attention', () => {
    expect(needsAttention('support_ticket', 'open', 'test', 'customer')).toBe(false);
    expect(needsAttention('support_ticket', 'open', 'spam', 'customer')).toBe(false);
    expect(needsAttention('shop_audit_lead', 'new', 'spam', null)).toBe(false);
  });

  it('age is whole days, never negative', () => {
    const now = Date.now();
    expect(ageInDays(new Date(now - 46.6 * DAY).toISOString(), now)).toBe(46);
    expect(ageInDays(new Date(now - 3600000).toISOString(), now)).toBe(0);
    expect(ageInDays(new Date(now + 5 * DAY).toISOString(), now)).toBe(0);
    expect(ageInDays('not a date', now)).toBe(0);
  });

  it('waitingSince is the first message of the unanswered run at the end of the thread', () => {
    const at = (d: number) => new Date(Date.UTC(2026, 8, d)).toISOString();
    const thread = [ // newest first
      { author_role: 'customer', created_at: at(18) }, { author_role: 'customer', created_at: at(17) },
      { author_role: 'support', created_at: at(10) }, { author_role: 'customer', created_at: at(1) },
    ];
    expect(waitingSince(thread, at(1))).toBe(at(17));
    expect(waitingSince([{ author_role: 'support', created_at: at(5) }], at(1))).toBe(at(1)); // answered: falls back to creation
    expect(waitingSince([], at(3))).toBe(at(3));
    expect(waitingSince([{ author_role: 'customer', created_at: at(9) }], at(2))).toBe(at(9));
  });

  it(`overdue means a ticket needing attention for ${SUPPORT_OVERDUE_DAYS}+ days`, () => {
    expect(isOverdue('support_ticket', true, SUPPORT_OVERDUE_DAYS)).toBe(true);
    expect(isOverdue('support_ticket', true, SUPPORT_OVERDUE_DAYS - 1)).toBe(false);
    expect(isOverdue('support_ticket', false, 100)).toBe(false); // already answered
    expect(isOverdue('shop_audit_lead', true, 100)).toBe(false); // leads are not tickets
  });
});

describe('filters and summary', () => {
  const items: TriagedItem[] = [
    item({ ageDays: 46, overdue: true }),                                            // old open ticket, overdue
    item({ ageDays: 1 }),                                                             // fresh open ticket
    item({ status: 'answered', needsAttention: false, ageDays: 10 }),                 // answered, still open
    item({ status: 'closed', open: false, needsAttention: false, ageDays: 30 }),      // resolved
    item({ triage: 'test', needsAttention: false, ageDays: 90 }),                     // confirmed test ticket, still "open"
    item({ source: 'shop_audit_lead', status: 'new', ageDays: 2 }),                   // new lead
    item({ source: 'shop_audit_lead', status: 'spam', triage: 'spam', open: false, needsAttention: false }),
  ];

  it('summary excludes confirmed test/spam from operational counts but reports them', () => {
    const s = summarizeSupport(items);
    expect(s.openTickets).toBe(3);
    expect(s.overdueTickets).toBe(1);
    expect(s.oldestOpenTicketAgeDays).toBe(46); // the 90-day test ticket is excluded
    expect(s.unreviewedOpenTickets).toBe(3);
    expect(s.newLeads).toBe(1);
    expect(s.confirmedNoise).toBe(2);
  });

  it('oldest open ticket is null when there are no open tickets', () => {
    expect(summarizeSupport([item({ status: 'closed', open: false })]).oldestOpenTicketAgeDays).toBeNull();
    expect(summarizeSupport([]).oldestOpenTicketAgeDays).toBeNull();
  });

  it('every filter selects the right records and never drops a record from "all"', () => {
    expect(filterSupportItems(items, 'all')).toHaveLength(7);
    expect(filterSupportItems(items, 'needs_attention')).toHaveLength(3);
    expect(filterSupportItems(items, 'overdue')).toHaveLength(1);
    expect(filterSupportItems(items, 'open')).toHaveLength(4); // 3 tickets + the new lead; noise excluded
    expect(filterSupportItems(items, 'resolved')).toHaveLength(1);
    expect(filterSupportItems(items, 'tickets')).toHaveLength(5);
    expect(filterSupportItems(items, 'leads')).toHaveLength(2);
    expect(filterSupportItems(items, 'test_spam')).toHaveLength(2);
  });

  it('does not mutate its input', () => {
    const copy = [...items];
    filterSupportItems(items, 'overdue');
    expect(items).toEqual(copy);
  });
});

describe('sanitizeSupportView', () => {
  it('accepts known views, falls back to all, and honours the legacy ?attention=1 link', () => {
    expect(sanitizeSupportView('overdue')).toBe('overdue');
    expect(sanitizeSupportView('bogus')).toBe('all');
    expect(sanitizeSupportView(undefined)).toBe('all');
    expect(sanitizeSupportView(undefined, '1')).toBe('needs_attention');
    expect(sanitizeSupportView('open', '1')).toBe('open'); // an explicit view wins
    expect(sanitizeSupportView('<script>')).toBe('all');
  });
});
