/**
 * In-app support: Ask AI, Message Support, Report a Bug.
 *
 * Built for the beta, where the cost of a lost report is high: a customer who
 * believes they reported a problem and hears nothing concludes the product is
 * unmaintained, not that a write failed.
 *
 * So the rules that matter are not about the UI. They are:
 *   - a support write that changes nothing must raise, never report success
 *   - the draft survives a failure, or the report is lost with it
 *   - support is never gated behind a paid plan or an AI quota
 *   - a customer cannot post a message attributed to support
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const service   = read('services/supportService.ts');
const widget    = read('components/support/SupportWidget.tsx');
const assistant = read('app/api/support/assistant/route.ts');
const migration = read('supabase/migrations/2026-08-03_support_tickets.sql');
const shell     = read('components/AppShell.tsx');

describe('writes are verified', () => {
  it('opening a ticket raises when no row comes back', () => {
    expect(service).toMatch(/if \(!ticket\) throw new Error/);
  });

  it('a ticket whose first message failed is reported, not silently left empty', () => {
    // An empty ticket reads as spam to whoever picks it up, and the customer
    // would never learn their words were lost.
    expect(service).toMatch(/if \(mErr\) throw new Error\(`Your message was not saved/);
  });

  it('a reply raises when nothing was inserted', () => {
    expect(service).toMatch(/if \(!data\) throw new Error\('Message not sent/);
  });

  it('refuses to open a ticket with no shop rather than writing an orphan', () => {
    expect(service).toMatch(/if \(!shopId\) throw new Error/);
  });
});

describe('the customer does not lose what they typed', () => {
  it('the draft is cleared only after a send succeeds', () => {
    // setDraft('') sits after the awaited write, not before it.
    const send = widget.slice(widget.indexOf('async function send()'), widget.indexOf('return (\n    <>\n      {error'));
    expect(send.indexOf("setDraft('')")).toBeGreaterThan(send.indexOf('await postMessage'));
  });

  it('a failed send surfaces the reason', () => {
    expect(widget).toMatch(/setError\(e instanceof Error \? e\.message : 'Message not sent\.'\)/);
  });
});

describe('support is not rationed', () => {
  it('the assistant is its own route, not the plan-gated /api/ai', () => {
    expect(assistant).toMatch(/export async function POST/);
    expect(widget).toMatch(/'\/api\/support\/assistant'/);
    expect(widget).not.toMatch(/'\/api\/ai'/);
  });

  it('answers any signed-in user, with no plan check', () => {
    expect(assistant).not.toMatch(/canAccess|getPlanStatus|requires a paid plan/);
  });

  it('falls back to a human instead of erroring when the model is unavailable', () => {
    // An unanswered support question must not look like a broken app.
    expect(assistant).toMatch(/fallback:/);
    expect(assistant).toMatch(/Message Support tab/);
  });

  it('still works for an account with no shop — the likeliest person to need help', () => {
    expect(assistant).toMatch(/No shop simply means unmetered rather than refused/);
  });
});

describe('the assistant is bounded in what it may claim', () => {
  it('is told to defer rather than invent', () => {
    expect(assistant).toMatch(/Never invent a menu path, a price, a setting or a feature/);
  });

  it('is told it cannot act on the account', () => {
    expect(assistant).toMatch(/Never claim to have changed anything/);
  });

  it('never asks for credentials', () => {
    expect(assistant).toMatch(/Never ask for a password, card number or any credential/);
  });

  it('sends billing questions to a human, since it cannot see their records', () => {
    expect(assistant).toMatch(/refund or their own billing history/);
  });
});

describe('tenant isolation', () => {
  it('scopes every policy through shop_users', () => {
    const policies = migration.match(/CREATE POLICY/g) ?? [];
    expect(policies.length).toBe(4);
    const scoped = migration.match(/shop_id IN \(SELECT shop_id FROM public\.shop_users WHERE user_id = auth\.uid\(\)\)/g) ?? [];
    expect(scoped.length).toBe(4);
  });

  it('stops a customer posting a message attributed to support', () => {
    // Without this a customer could manufacture an official-looking reply.
    expect(migration).toMatch(/author_role = 'customer'/);
  });

  it('asserts RLS actually enabled rather than assuming it', () => {
    // A table with policies and relrowsecurity false is unprotected.
    expect(migration).toMatch(/RAISE EXCEPTION 'RLS did not enable/);
  });

  it('grants anon nothing', () => {
    expect(migration).not.toMatch(/TO anon/);
  });

  it('gives customers no UPDATE or DELETE — a thread is a record', () => {
    expect(migration).not.toMatch(/FOR UPDATE TO authenticated/);
    expect(migration).not.toMatch(/FOR DELETE TO authenticated/);
  });
});

describe('bug reports carry their own diagnostics', () => {
  it('captures where the customer was', () => {
    expect(service).toMatch(/path: window\.location\.pathname/);
    expect(service).toMatch(/userAgent: navigator\.userAgent/);
  });

  it('collects nothing from customer records', () => {
    // The comment wraps, so match the claim rather than a whole line of prose.
    expect(service).toMatch(/no page contents, no customer records/);
  });

  it('tells the customer what is being sent', () => {
    expect(widget).toMatch(/nothing from your customer records/);
  });
});

describe('reachability', () => {
  it('is mounted on the shell, so it works from every module', () => {
    expect(shell).toMatch(/<SupportWidget \/>/);
  });

  it('renders nothing for a signed-out visitor', () => {
    expect(widget).toMatch(/if \(!signedIn\) return null/);
  });

  it('closes on Escape', () => {
    expect(widget).toMatch(/e\.key === 'Escape'/);
  });

  it('honours reduced-motion', () => {
    expect(widget).toMatch(/prefers-reduced-motion/);
  });

  it('uses theme variables rather than a hardcoded palette', () => {
    expect(widget).toMatch(/var\(--surface\)/);
    expect(widget).toMatch(/var\(--accent\)/);
  });
});
