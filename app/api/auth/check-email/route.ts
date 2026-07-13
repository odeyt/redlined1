import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/supabaseServer';

// Rate-limit: max 5 checks per IP per minute (in-memory, resets on cold start)
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 5;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let email: string;
  try {
    const body = await req.json();
    email = (body.email ?? '').toString().trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const admin = getAdminDb();
  // listUsers supports filtering by email via the admin API
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });

  if (error) {
    // Fail open — don't block password reset if the check errors
    return NextResponse.json({ exists: true });
  }

  const exists = data.users.some(u => u.email?.toLowerCase() === email);
  return NextResponse.json({ exists });
}
