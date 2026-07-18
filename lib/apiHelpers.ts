import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import type { ZodType } from 'zod';

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/**
 * Parses a request body as JSON and validates it against a zod schema in one
 * step. Malformed JSON and schema violations both return a generic 400 —
 * neither the parser's exception text nor the zod issue list (which can
 * echo back submitted values) is sent to the client.
 */
export async function parseJsonBody<T>(req: NextRequest, schema: ZodType<T>): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid request data' }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Logs the real error server-side and returns a generic, client-safe
 * message. Use this instead of `e instanceof Error ? e.message : ...` in
 * any response body — Supabase/Postgres error text can include column
 * names, constraint names, or other schema internals.
 */
export function sanitizeError(e: unknown, context: string, fallback = 'Something went wrong'): string {
  console.error(`[${context}]`, e);
  return fallback;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Hard cap on each in-memory Map's size. Without this, a steady stream of
// distinct keys (e.g. one-off invites to addresses that never repeat) would
// grow these Maps forever for the lifetime of the server process — a slow
// memory leak. When a Map exceeds the cap, expired entries are swept first;
// if it's still over the cap (i.e. genuinely high concurrent traffic, not
// just stale entries), the oldest remaining entries are evicted outright.
// This keeps memory bounded but means a rate-limit/dedup window can be
// forgotten early under sustained load — acceptable for a best-effort
// control, not acceptable for anything relying on it as a hard guarantee.
const MAX_MAP_ENTRIES = 5000;

function boundMapSize<V>(map: Map<string, V>, isExpired: (value: V, now: number) => boolean): void {
  if (map.size <= MAX_MAP_ENTRIES) return;
  const now = Date.now();
  for (const [key, value] of map) {
    if (isExpired(value, now)) map.delete(key);
  }
  if (map.size > MAX_MAP_ENTRIES) {
    const excess = map.size - MAX_MAP_ENTRIES;
    let i = 0;
    for (const key of map.keys()) {
      if (i++ >= excess) break;
      map.delete(key);
    }
  }
}

type Bucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, Bucket>();

/**
 * Best-effort ABUSE MITIGATION, not a security control and not a hard
 * guarantee: this is a per-process in-memory counter (same approach already
 * used in app/api/auth/check-email/route.ts). It resets on cold start, is
 * not shared across concurrent serverless instances, and a determined
 * caller distributing requests across instances (or simply hitting a fresh
 * cold start) can exceed the stated limit. Do not rely on this alone to
 * enforce a business rule that must actually hold — pair it with the real
 * authorization check (requireShopRole) for anything security-sensitive.
 * For a durable, globally-consistent limit, replace with Upstash Redis /
 * Vercel KV.
 */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  boundMapSize(rateBuckets, (bucket, now) => now > bucket.resetAt);
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

// Generous upper bound used only to decide when an entry is safe to sweep
// for size-bounding purposes — independent of whatever (smaller) window
// individual wasRecentlyPerformed() callers pass in.
const IDEMPOTENCY_SWEEP_AGE_MS = 60 * 60 * 1000;
const lastActionAt = new Map<string, number>();

/**
 * Best-effort idempotency guard, not a durable dedup guarantee: returns
 * true if the same action key was already performed within `windowMs`
 * (caller should then skip the side effect and return success without
 * repeating it — e.g. don't re-send an SMS/email). Same per-instance,
 * per-process caveats as isRateLimited — under concurrent instances or a
 * cold start, a duplicate can still slip through.
 */
export function wasRecentlyPerformed(key: string, windowMs: number): boolean {
  boundMapSize(lastActionAt, (lastAt, now) => now - lastAt > IDEMPOTENCY_SWEEP_AGE_MS);
  const now = Date.now();
  const last = lastActionAt.get(key);
  if (last !== undefined && now - last < windowMs) return true;
  lastActionAt.set(key, now);
  return false;
}

/**
 * Validates NEXT_PUBLIC_SITE_URL is a well-formed URL before it's used to
 * build an invitation/redirect link — an unset or malformed value must
 * never silently become part of a URL we email to a user. https only,
 * except http+localhost for local development. Returns the normalized
 * origin (no trailing slash/path), or null if the env var is missing or
 * doesn't parse as a trusted absolute URL.
 */
export function getTrustedSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const isLocalHttp = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (parsed.protocol !== 'https:' && !isLocalHttp) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}
