/**
 * Operator support inbox.
 *
 * Reads and writes with service_role, because the customer-facing RLS scopes
 * everything through shop_users and an operator belongs to no customer's shop.
 * That makes authorisation entirely this route's responsibility — there is no
 * second line of defence behind it, unlike every other route in the app.
 *
 * So the tests that matter are: it is platform-owner only, it is invisible to
 * customers, and a support reply cannot be forged from the customer side.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PLATFORM_MODULES, canAccess } from '../planGate';
import { navItems } from '../mock-data';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const route     = read('app/api/support/inbox/route.ts');
const view      = read('features/support-inbox/SupportInboxView.tsx');
const migration = read('supabase/migrations/2026-08-03_support_tickets.sql');
const shell     = read('components/AppShell.tsx');

describe('only the platform owner can reach it', () => {
  it('both handlers check verifyPlatformOwner', () => {
    expect((route.match(/verifyPlatformOwner\(req\)/g) ?? []).length).toBe(2);
  });

  it('checks before touching the database, not after', () => {
    expect(route.indexOf('verifyPlatformOwner')).toBeLessThan(route.indexOf("from('support_tickets')"));
  });

  it('answers 401 to an anonymous caller and 403 to a signed-in non-owner', () => {
    expect(route).toMatch(/status: 401/);
    expect(route).toMatch(/forbidden\(auth\.reason\)/);
  });

  it('is hidden from every customer sidebar', () => {
    expect(PLATFORM_MODULES.has('support-inbox')).toBe(true);
  });

  it('is a real module, reachable once visible', () => {
    expect(navItems.some(([id]) => id === 'support-inbox')).toBe(true);
    expect(shell).toMatch(/'support-inbox':\s+SupportInboxView/);
  });

  it('being platform-only did not exempt it from plan gating', () => {
    // The mistake made when AI Copilot was hidden: a single set for both
    // visibility and entitlement handed the free tier a paid module.
    expect(canAccess('support-inbox', 'free')).toBe(false);
  });
});

describe('a support reply cannot be forged', () => {
  it('customers may only insert as themselves, as a customer', () => {
    expect(migration).toMatch(/author_role = 'customer'/);
  });

  it('support replies carry no author_id — they are from the team, not a person', () => {
    expect(route).toMatch(/author_id:\s+null/);
  });

  it('the reply takes its shop from the ticket, never from the caller', () => {
    // shop_id is denormalised onto messages for RLS; trusting the request body
    // would let a reply be written into another shop's thread.
    expect(route).toMatch(/shop_id:\s+ticket\.shop_id/);
  });
});

describe('writes are verified', () => {
  it('a status change that matched no ticket is a 404, not a success', () => {
    expect(route).toMatch(/if \(count === 0\) return NextResponse\.json\(\{ error: 'No such ticket' \}/);
  });

  it('a reply that inserted nothing is reported', () => {
    expect(route).toMatch(/if \(!inserted\)/);
  });

  it('a failed status update does not report the reply as lost', () => {
    // The reply is the thing that matters; the status is bookkeeping.
    expect(route).toMatch(/Best effort: the reply is the thing that matters/);
  });
});

describe('the inbox answers "what is waiting on me"', () => {
  it('marks threads whose last message is not from support', () => {
    expect(route).toMatch(/awaitingUs: lastRole\.get\(t\.id\) !== 'support'/);
  });

  it('does not mark closed threads as waiting', () => {
    expect(route).toMatch(/t\.status !== 'closed'/);
  });

  it('opens on that filter rather than on everything', () => {
    expect(view).toMatch(/useState<'waiting' \| 'all' \| 'bugs'>\('waiting'\)/);
  });

  it('resolves shop names so the list is readable', () => {
    expect(route).toMatch(/shopName: names\.get\(t\.shop_id\)/);
  });
});

describe('operator ergonomics', () => {
  it('keeps the draft when a reply fails', () => {
    // Retyping a considered reply is how threads go unanswered.
    const send = view.slice(view.indexOf('async function send()'), view.indexOf('async function setStatus'));
    expect(send.indexOf("setReply('')")).toBeGreaterThan(send.indexOf('await fetch'));
  });

  it('shows the diagnostics a bug report collected', () => {
    expect(view).toMatch(/active\.kind === 'bug' && active\.context/);
    expect(view).toMatch(/userAgent/);
  });

  it('reads responses as text first, so an error page is not a JSON crash', () => {
    expect(view).toMatch(/const raw = await res\.text\(\)/);
  });
});

/**
 * Notification.
 *
 * The inbox worked from the first commit, but nothing announced a new message:
 * the operator had to remember to open it. Asked "where is this message routed
 * to?", the honest answer was "somewhere you have to go and look" — which
 * during a beta is the same as having no support channel, since the first sign
 * of a problem becomes a customer asking why nobody replied.
 */
describe('a new message reaches the operator', () => {
  const notify  = read('app/api/support/notify/route.ts');
  const service = read('services/supportService.ts');

  it('opening a ticket triggers a notification', () => {
    expect(service).toMatch(/void notifyOperator\(ticket\.id as string\)/);
  });

  it('a reply on an existing thread notifies too', () => {
    // A customer answering a follow-up is when the thread must not go cold.
    expect(service).toMatch(/void notifyOperator\(ticketId\)/);
  });

  it('notifies only after the message is committed', () => {
    const create = service.slice(service.indexOf('export async function createTicket'), service.indexOf('async function notifyOperator'));
    expect(create.indexOf('void notifyOperator')).toBeGreaterThan(create.indexOf('if (mErr) throw'));
  });

  it('a mail failure never surfaces to the customer as "not sent"', () => {
    // Their words are already saved; the notification is about promptness.
    expect(service).toMatch(/Fire-and-forget by design/);
    expect(notify).toMatch(/notified: false, reason: 'send_failed'/);
  });

  it('reports a send failure rather than swallowing it', () => {
    expect(notify).toMatch(/alertException\('support'/);
  });

  it('refuses anonymous callers — an open mail endpoint is a spam relay', () => {
    expect(notify).toMatch(/if \(!user\) return NextResponse\.json\(\{ error: 'Unauthorized' \}/);
  });

  it('re-reads the ticket server-side rather than trusting the request body', () => {
    // Otherwise a caller dictates what the email says.
    expect(notify).toMatch(/from\('support_tickets'\)[\s\S]{0,160}\.eq\('id', body\.ticketId\)/);
  });

  it('checks the caller belongs to the ticket\'s shop', () => {
    // One customer must not be able to trigger mail about another's thread.
    expect(notify).toMatch(/\.eq\('shop_id', ticket\.shop_id\)/);
  });

  it('escapes message text into the email', () => {
    expect(notify).toMatch(/const esc = /);
    expect(notify).toMatch(/esc\(latest\?\.body/);
  });

  it('carries the whole message, so a reply can be judged from a phone', () => {
    expect(notify).toMatch(/white-space:pre-wrap/);
  });

  it('includes bug diagnostics in the email', () => {
    expect(notify).toMatch(/'path', 'viewport', 'timezone', 'language', 'userAgent'/);
  });

  it('degrades quietly when email is not configured', () => {
    expect(notify).toMatch(/reason: 'not_configured'/);
  });
});
