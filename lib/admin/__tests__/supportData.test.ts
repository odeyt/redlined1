/**
 * listSupportItems against an in-memory database: ticket/lead separation, age
 * and overdue, the optional triage column (before and after its migration is
 * applied), account linking rules, and the guarantee that nothing is written.
 * All ids and text are synthetic.
 */
import { listSupportItems } from '../supportData';
import { createFakeAdminDb, type Row } from './fakeAdminDb';

const DAY = 86400000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const SHOP = 'e1000000-0000-4000-8000-000000000001';
const OTHER = 'e2000000-0000-4000-8000-000000000002';

const fake = createFakeAdminDb();

function ticket(id: string, o: Partial<Row> = {}): Row {
  return { id, shop_id: SHOP, created_by: 'u1', kind: 'chat', subject: `Ticket ${id}`, status: 'open', severity: null, created_at: ago(1), ...o };
}
let eventSeq = 0;
/** One row of the owner's marker history. Rows are read newest-first by id, so a later call wins. */
function marking(ticketId: string, triage: string): Row {
  return { id: ++eventSeq, ticket_id: ticketId, triage, set_by: 'owner@example-test.invalid', created_at: ago(0) };
}
function message(ticketId: string, role: string, at = ago(1)): Row {
  return { id: `m-${ticketId}-${role}`, ticket_id: ticketId, author_role: role, created_at: at };
}
function lead(id: string, o: Partial<Row> = {}): Row {
  return { id, email: `${id}@example-test.invalid`, shop_name: `Lead ${id}`, source: 'site', status: 'new', created_at: ago(1), ...o };
}

function reset() {
  fake.state.failTables.clear();
  fake.state.missingColumns = {};
  fake.state.selects.length = 0;
  eventSeq = 0;
  fake.state.tables = {
    shops: [{ id: SHOP, name: 'Real Shop', created_at: ago(90), archived_at: null }, { id: OTHER, name: 'Other Shop', created_at: ago(90), archived_at: null }],
    support_tickets: [
      ticket('t-old', { created_at: ago(46) }),
      ticket('t-new', { created_at: ago(0.2) }),
      ticket('t-answered', { status: 'answered', created_at: ago(10) }),
      ticket('t-closed', { status: 'closed', created_at: ago(30) }),
      ticket('t-test', { created_at: ago(60) }),
      ticket('t-other', { shop_id: OTHER, kind: 'bug', severity: 'minor', created_at: ago(5) }),
    ],
    support_ticket_triage_events: [marking('t-test', 'test')],
    support_messages: [
      message('t-old', 'customer', ago(46)), message('t-new', 'customer', ago(0.2)), message('t-answered', 'customer', ago(9)), message('t-answered', 'support', ago(8)),
      message('t-closed', 'support'), message('t-test', 'customer', ago(60)), message('t-other', 'customer', ago(5)),
    ],
    shop_audit_leads: [lead('l-new'), lead('l-spam', { status: 'spam', created_at: ago(3) }), lead('l-won', { status: 'won', created_at: ago(20) })],
    profiles: [{ id: 'p1', email: 'l-new@example-test.invalid', shop_id: SHOP, role: 'Owner', plan: 'free', trial_ends_at: null, shop_name: null, billing_status: null }],
  };
}

jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => fake.db }));

beforeEach(reset);

const byId = (r: Awaited<ReturnType<typeof listSupportItems>>, id: string) => r.items.find(i => i.id === id)!;

describe('listSupportItems', () => {
  it('keeps support tickets and shop-audit leads distinct, and preserves every record', async () => {
    const r = await listSupportItems(NOW);
    expect(r.items).toHaveLength(9);
    expect(r.items.filter(i => i.source === 'support_ticket')).toHaveLength(6);
    expect(r.items.filter(i => i.source === 'shop_audit_lead')).toHaveLength(3);
  });

  it('computes ticket age in whole days', async () => {
    const r = await listSupportItems(NOW);
    expect(byId(r, 't-old').ageDays).toBe(46);
    expect(byId(r, 't-new').ageDays).toBe(0);
  });

  it('flags an unanswered ticket as overdue once it has waited the threshold, and never an answered one', async () => {
    const r = await listSupportItems(NOW);
    expect(byId(r, 't-old').overdue).toBe(true);
    expect(byId(r, 't-new').overdue).toBe(false);
    expect(byId(r, 't-answered').overdue).toBe(false); // support replied last
    expect(byId(r, 't-closed').overdue).toBe(false);
  });

  it('measures overdue from the first unanswered customer message, not from when the ticket was opened', async () => {
    // Opened 20 days ago, answered, and the customer followed up half a day ago.
    fake.state.tables.support_tickets.push(ticket('t-followup', { created_at: ago(20) }));
    fake.state.tables.support_messages.push(
      message('t-followup', 'customer', ago(20)), message('t-followup', 'support', ago(19)), message('t-followup', 'customer', ago(0.5)),
    );
    const r = await listSupportItems(NOW);
    const t = byId(r, 't-followup');
    expect(t.ageDays).toBe(20);
    expect(t.needsAttention).toBe(true);
    expect(t.waitingDays).toBe(0);
    expect(t.overdue).toBe(false);
  });

  it('counts a run of unanswered customer messages from the first of them', async () => {
    fake.state.tables.support_tickets.push(ticket('t-run', { created_at: ago(30) }));
    fake.state.tables.support_messages.push(
      message('t-run', 'customer', ago(30)), message('t-run', 'support', ago(29)),
      message('t-run', 'customer', ago(4)), message('t-run', 'customer', ago(3)),
    );
    const t = byId(await listSupportItems(NOW), 't-run');
    expect(t.waitingDays).toBe(4);
    expect(t.overdue).toBe(true);
  });

  it('a ticket with no readable messages is dated from its creation and still surfaces', async () => {
    fake.state.tables.support_tickets.push(ticket('t-silent', { created_at: ago(9) }));
    const t = byId(await listSupportItems(NOW), 't-silent');
    expect(t.waitingDays).toBe(9);
    expect(t.overdue).toBe(true);
  });

  it('has no waiting time for a ticket that is not waiting on us, or for a lead', async () => {
    const r = await listSupportItems(NOW);
    expect(byId(r, 't-answered').waitingDays).toBeNull();
    expect(byId(r, 't-closed').waitingDays).toBeNull();
    expect(byId(r, 'l-new').waitingDays).toBeNull();
  });

  it('reports truncation when a source reaches its cap, and not otherwise', async () => {
    expect((await listSupportItems(NOW)).truncated).toBe(false);
    fake.state.tables.shop_audit_leads = Array.from({ length: 200 }, (_, i) => lead(`l-${i}`, { created_at: ago(i % 30) }));
    const r = await listSupportItems(NOW);
    expect(r.truncated).toBe(true);
    expect(r.maxItemsPerSource).toBe(200);
  });

  it('needs-attention follows the documented predicate', async () => {
    const r = await listSupportItems(NOW);
    expect(byId(r, 't-old').needsAttention).toBe(true);
    expect(byId(r, 't-answered').needsAttention).toBe(false);
    expect(byId(r, 't-closed').needsAttention).toBe(false);
    expect(byId(r, 'l-new').needsAttention).toBe(true);
    expect(byId(r, 'l-won').needsAttention).toBe(false);
  });

  it('confirmed test/spam is kept but excluded from operational counts and from needs-attention', async () => {
    const r = await listSupportItems(NOW);
    expect(byId(r, 't-test').triage).toBe('test');
    expect(byId(r, 't-test').needsAttention).toBe(false);
    expect(byId(r, 'l-spam').triage).toBe('spam');
    expect(r.summary.confirmedNoise).toBe(2);
    expect(r.summary.openTickets).toBe(4); // old, new, answered, other — not the test ticket
    expect(r.summary.oldestOpenTicketAgeDays).toBe(46); // not the 60-day-old test ticket
  });

  it('shows the oldest open real-ticket age and the overdue count', async () => {
    const r = await listSupportItems(NOW);
    expect(r.summary.overdueTickets).toBe(2); // t-old and t-other (5d, customer last)
    expect(r.summary.unreviewedOpenTickets).toBe(4);
  });
});

describe('ticket linking', () => {
  it('links a ticket to its own shop_id — a confirmed relationship, never a heuristic', async () => {
    const r = await listSupportItems(NOW);
    expect(byId(r, 't-other').accountId).toBe(OTHER);
    expect(byId(r, 't-other').accountMatchIsHeuristic).toBe(false);
  });

  it('links a lead only by an exact email match, and marks it as a heuristic', async () => {
    const r = await listSupportItems(NOW);
    expect(byId(r, 'l-new').accountId).toBe(SHOP);
    expect(byId(r, 'l-new').accountMatchIsHeuristic).toBe(true);
  });

  it('never links an account from a matching display name alone', async () => {
    fake.state.tables.shop_audit_leads.push(lead('l-namesake', { shop_name: 'Real Shop', email: 'someone-else@example-test.invalid' }));
    const r = await listSupportItems(NOW);
    expect(byId(r, 'l-namesake').accountId).toBeNull();
  });
});

describe("the owner's ticket markers (support_ticket_triage_events)", () => {
  it('before the migration is applied every ticket is unreviewed, nothing is dropped, and the queue still loads', async () => {
    fake.state.failTables.add('support_ticket_triage_events'); // the table does not exist yet
    const r = await listSupportItems(NOW);
    expect(r.triageSupported).toBe(false);
    expect(r.items.filter(i => i.source === 'support_ticket')).toHaveLength(6);
    expect(r.items.filter(i => i.source === 'support_ticket').every(i => i.triage === 'unreviewed')).toBe(true);
    expect(byId(r, 'l-spam').triage).toBe('spam'); // leads already have a constrained spam status
    expect(r.summary.openTickets).toBe(5); // the would-be test ticket counts until it is marked
  });

  it('once the table exists it is read', async () => {
    const r = await listSupportItems(NOW);
    expect(r.triageSupported).toBe(true);
    expect(byId(r, 't-test').triage).toBe('test');
    expect(byId(r, 't-old').triage).toBe('unreviewed'); // never marked
  });

  it('the newest marking is the current one, so a mistaken marking can be changed back', async () => {
    fake.state.tables.support_ticket_triage_events.push(marking('t-test', 'real'));
    expect(byId(await listSupportItems(NOW), 't-test').triage).toBe('real');
    fake.state.tables.support_ticket_triage_events.push(marking('t-test', 'unreviewed'));
    expect(byId(await listSupportItems(NOW), 't-test').triage).toBe('unreviewed');
    fake.state.tables.support_ticket_triage_events.push(marking('t-test', 'spam'));
    expect(byId(await listSupportItems(NOW), 't-test').triage).toBe('spam');
  });

  it('a marked test/spam ticket is kept, but leaves the operational counts', async () => {
    const r = await listSupportItems(NOW);
    expect(r.items.some(i => i.id === 't-test')).toBe(true);
    expect(r.summary.openTickets).toBe(4);
    expect(r.summary.confirmedNoise).toBe(2); // the marked ticket and the spam lead
  });

  it('a marking of "real" confirms the ticket and keeps it counted', async () => {
    fake.state.tables.support_ticket_triage_events.push(marking('t-old', 'real'));
    const r = await listSupportItems(NOW);
    expect(byId(r, 't-old').triage).toBe('real');
    expect(byId(r, 't-old').needsAttention).toBe(true);
    expect(r.summary.unreviewedOpenTickets).toBe(3); // one fewer than before
  });

  it('an unexpected stored value is unreviewed, never confirmed noise', async () => {
    fake.state.tables.support_ticket_triage_events.push(marking('t-old', 'probably spam'));
    const r = await listSupportItems(NOW);
    expect(byId(r, 't-old').triage).toBe('unreviewed');
    expect(byId(r, 't-old').needsAttention).toBe(true);
  });

  it('ignores markings for tickets that are not in the list', async () => {
    fake.state.tables.support_ticket_triage_events.push(marking('t-gone', 'spam'));
    const r = await listSupportItems(NOW);
    expect(r.items).toHaveLength(9);
    expect(r.summary.confirmedNoise).toBe(2);
  });

  it('selects only ticket_id and triage from the marker table — never who set it', async () => {
    await listSupportItems(NOW);
    const cols = fake.state.selects.filter(s => s.table === 'support_ticket_triage_events').flatMap(s => s.columns);
    expect([...new Set(cols)].sort()).toEqual(['ticket_id', 'triage']);
    expect(JSON.stringify(await listSupportItems(NOW))).not.toMatch(/set_by|owner@example-test/);
  });

  it('still lists everything when a ticket-marker read fails part-way', async () => {
    fake.state.failTables.add('support_ticket_triage_events');
    const r = await listSupportItems(NOW);
    expect(r.sources.supportTickets).toBe('available');
    expect(r.items.filter(i => i.source === 'support_ticket')).toHaveLength(6);
  });
});

describe('what the support reader will and will not touch', () => {
  it('never selects message bodies or lead free-text fields', async () => {
    await listSupportItems(NOW);
    const cols = fake.state.selects.flatMap(s => s.columns);
    expect(cols).not.toContain('body');
    expect(cols).not.toContain('context');
    expect(cols).not.toContain('biggest_challenge');
    expect(cols).not.toContain('current_software');
  });

  it('is read-only: the query surface has no write methods', () => {
    const q = fake.db.from('support_tickets');
    for (const m of ['insert', 'update', 'upsert', 'delete', 'rpc']) expect(q).not.toHaveProperty(m);
  });

  it('does not return message text or emails in the list shape', async () => {
    const r = await listSupportItems(NOW);
    expect(JSON.stringify(r)).not.toMatch(/example-test\.invalid/);
    for (const i of r.items) expect(Object.keys(i)).not.toContain('email');
  });

  it('reports the ticket source unavailable when the table probe passes but the ticket read itself fails', async () => {
    // e.g. a column the query names is missing: the count probe (select *) succeeds, the real select does not.
    fake.state.missingColumns = { support_tickets: ['severity'] };
    const r = await listSupportItems(NOW);
    expect(r.sources.supportTickets).toBe('unavailable');
    expect(r.items.filter(i => i.source === 'support_ticket')).toHaveLength(0);
    expect(r.summary.openTickets).toBe(0); // zeros from a failed read: callers must use `sources`, not the zeros
  });

  it('degrades to an empty queue, not an exception, when the ticket table is unreadable', async () => {
    fake.state.failTables.add('support_tickets');
    const r = await listSupportItems(NOW);
    expect(r.sources.supportTickets).toBe('unavailable');
    expect(r.items.every(i => i.source === 'shop_audit_lead')).toBe(true);
  });
});
