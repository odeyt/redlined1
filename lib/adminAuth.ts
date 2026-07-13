/**
 * lib/adminAuth.ts
 * Platform-owner / internal-admin authorization guard.
 *
 * Access is controlled server-side only via PLATFORM_OWNER_EMAIL env var.
 * Client code never sees the authorization decision directly.
 *
 * No client-side flag, no DB role lookup — environment variable is the
 * single source of truth. Cannot be spoofed via request headers.
 */

import { getAdminDb } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

// ─── Authorized emails ────────────────────────────────────────────────────────

function getAuthorizedEmails(): Set<string> {
  const raw = process.env.PLATFORM_OWNER_EMAIL ?? '';
  return new Set(
    raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  );
}

// ─── Session email lookup ─────────────────────────────────────────────────────

async function getSessionEmail(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) return null;

    const db = getAdminDb();
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user?.email) return null;
    return user.email.toLowerCase();
  } catch {
    return null;
  }
}

// ─── Cookie-based session (for server components / page routes) ───────────────

async function getSessionEmailFromCookie(req: NextRequest): Promise<string | null> {
  try {
    // Try Authorization header first
    const fromHeader = await getSessionEmail(req);
    if (fromHeader) return fromHeader;

    // Fall back to cookie-based Supabase session
    const { createServerClient } = await import('@supabase/ssr');
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll() { /* read-only in middleware */ },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AdminAuthResult {
  authorized: boolean;
  email: string | null;
  reason: string;
}

/**
 * Verify that the incoming request is from the platform owner.
 * Used in API route handlers.
 */
export async function verifyPlatformOwner(req: NextRequest): Promise<AdminAuthResult> {
  const authorized = getAuthorizedEmails();

  if (authorized.size === 0) {
    return {
      authorized: false,
      email: null,
      reason: 'PLATFORM_OWNER_EMAIL not configured',
    };
  }

  const email = await getSessionEmailFromCookie(req);

  if (!email) {
    return { authorized: false, email: null, reason: 'Not authenticated' };
  }

  if (!authorized.has(email)) {
    return { authorized: false, email, reason: 'Not authorized as platform owner' };
  }

  return { authorized: true, email, reason: 'OK' };
}

/**
 * Returns a 403 JSON response with a safe error message.
 * Never reveals whether the endpoint exists to unauthorized callers.
 */
export function forbidden(reason: string): NextResponse {
  return NextResponse.json(
    { error: 'Forbidden', detail: reason },
    { status: 403 }
  );
}

/**
 * Validates and clamps a date range from query params.
 * Default: last 30 days. Max: 366 days.
 */
export function parseDateRange(req: NextRequest): { from: Date; to: Date } | null {
  try {
    const url = new URL(req.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    const to = toParam ? new Date(toParam) : new Date();
    const from = fromParam
      ? new Date(fromParam)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;

    // Cap range at 366 days
    const maxMs = 366 * 24 * 60 * 60 * 1000;
    const clamped = from.getTime() < to.getTime() - maxMs
      ? new Date(to.getTime() - maxMs)
      : from;

    return { from: clamped, to };
  } catch {
    return null;
  }
}

/** Internal D1 shop IDs — excluded from all commercial revenue metrics. */
export function getInternalShopIds(): Set<string> {
  const fromEnv = process.env.INTERNAL_SHOP_IDS ?? '';
  const fromDefault = [
    '38d55fae-741b-4bac-b520-f96eed65bf38',
    '90b72748-bf01-4456-999f-f4ba48091606',
  ];

  const ids = fromEnv
    ? fromEnv.split(',').map(s => s.trim()).filter(Boolean)
    : fromDefault;

  return new Set(ids);
}
