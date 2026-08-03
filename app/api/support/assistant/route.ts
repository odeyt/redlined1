/**
 * POST /api/support/assistant
 *
 * The in-app support assistant: answers questions about using RedlineD1.
 *
 * Deliberately separate from /api/ai, for two reasons.
 *
 * Support is not a feature to ration. /api/ai gates on a paid plan and meters
 * against the shop's daily allowance; a customer who cannot get help is a
 * customer who churns, and a free-plan shop asking "how do I create an invoice"
 * must get an answer. This route is open to any signed-in user and counts
 * against its own budget, so a long support conversation never eats the AI
 * credits someone paid for.
 *
 * And the failure modes differ. If the model is unavailable here, the right
 * answer is "message a human", not an error — which is why every failure path
 * below returns a usable fallback rather than a status code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordUsage } from '@/commercial/usage/usageService';
import { getUsage } from '@/commercial/usage/usageService';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const AI_MODEL = process.env.AI_MODEL?.trim() || 'claude-haiku-4-5-20251001';

/** Generous — this is support. Bounds a runaway client, nothing more. */
const DAILY_LIMIT = 60;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * What the assistant is allowed to claim.
 *
 * Grounded deliberately narrowly. An assistant that invents a menu item or a
 * pricing detail costs more trust than it saves, so it is told to hand over to
 * a human rather than guess — and the UI offers that handover on every reply.
 */
const SYSTEM_PROMPT = `You are the in-app support assistant for RedlineD1, auto-shop management software.

You help shop owners and their staff use the product. Be brief and concrete: two or three sentences, or short numbered steps. Write plainly, as a knowledgeable colleague would, not as marketing copy.

What the product contains:
- Customers, Vehicles, Appointments, Maintenance Schedules
- Job Cards, Repair Orders, Inspections, Estimates, Invoicing, Payments
- Parts Inventory, Parts Quotations, Parts Ordered, Parts Received
- Vehicle Intake, Employees, Reports, Communication, VIN Decode, DTC Lookup
- Command Center — the home screen for owners and managers
- Settings, including Default Currency, labour rate, tax rate and staff role permissions
- Billing & Subscription, and Plans & Gates

Plans: a new account gets a 7-day trial with every feature unlocked, then becomes Free Forever with core features (customers, vehicles, job cards, estimates, invoices) and no card required. Paid plans are Solo $24/mo, Starter $49/mo, Professional $99/mo, Business $179/mo, plus Enterprise by arrangement. Annual billing saves about 17%.

Rules you must follow:
- If you do not know, say so and suggest messaging the team. Never invent a menu path, a price, a setting or a feature.
- Never claim to have changed anything in their account. You cannot act, only explain.
- Never ask for a password, card number or any credential.
- For anything about a specific charge, refund or their own billing history, tell them to message the team — you cannot see their records.
- If they describe something broken, acknowledge it plainly and point them at the Report a Bug tab.`;

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { question?: string; history?: Array<{ role: string; text: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const question = (body.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });
  if (question.length > 2000) {
    return NextResponse.json({ error: 'That question is too long — try summarising it.' }, { status: 400 });
  }

  // Attribute to the caller's own shop, resolved server-side so it cannot be
  // forged. No shop simply means unmetered rather than refused: support must
  // work even for an account whose provisioning is broken — that is precisely
  // the person most likely to need it.
  const { data: membership } = await admin()
    .from('shop_users').select('shop_id').eq('user_id', user.id).limit(1).maybeSingle();
  const shopId = membership?.shop_id ?? '';

  if (shopId) {
    // Own usage key, deliberately distinct from /api/ai's 'ai_requests'. Both
    // used to write the same key, so a long support conversation silently ate
    // into the daily /api/ai allowance this route's own docs say it must
    // never touch — a customer using support heavily would find themselves
    // closer to (or over) their DTC Lookup / Inspections quota for reasons
    // they never triggered themselves.
    const used = await getUsage(shopId, 'support_ai_requests');
    if (used > DAILY_LIMIT * 30) {
      return NextResponse.json({
        answer: null,
        fallback: 'The assistant is unavailable right now. Use the Message Support tab and a human will reply.',
      });
    }
  }

  // Mock and outage both fall back to a human rather than erroring: an
  // unanswered support question should never look like a broken app.
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({
      answer: null,
      fallback: 'The assistant is not configured on this deployment. Use the Message Support tab and a human will reply.',
    });
  }

  const messages = [
    ...(body.history ?? []).slice(-6).map(h => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.text ?? '').slice(0, 2000),
    })),
    { role: 'user', content: question },
  ];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 600, system: SYSTEM_PROMPT, messages }),
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}`);

    const data = await res.json();
    const answer = data.content?.[0]?.text?.trim() ?? '';
    if (!answer) throw new Error('empty response');

    if (shopId) {
      await recordUsage(shopId, 'support_ai_requests', 1, {
        feature: 'support_assistant',
        model: AI_MODEL,
        input_tokens: data.usage?.input_tokens ?? 0,
        output_tokens: data.usage?.output_tokens ?? 0,
        user_id: user.id,
      }, 'support_assistant');
    }

    return NextResponse.json({ answer, model: AI_MODEL });
  } catch (err) {
    console.error('[support/assistant]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({
      answer: null,
      fallback: 'I could not reach the assistant just now. Use the Message Support tab and a human will reply.',
    });
  }
}
