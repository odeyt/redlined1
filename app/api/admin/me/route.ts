import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    // Read PLATFORM_OWNER_EMAIL at runtime (never baked at build time)
    const raw = process.env.PLATFORM_OWNER_EMAIL ?? '';
    const ownerEmails = raw
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    if (ownerEmails.length === 0) {
      return NextResponse.json({ isPlatformOwner: false, debug: 'env_not_set' });
    }

    // Get JWT from Authorization header (sidebar sends it explicitly)
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ isPlatformOwner: false, debug: 'no_token' });
    }

    // Verify token with service role client
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!svcKey) {
      return NextResponse.json({ isPlatformOwner: false, debug: 'no_svc_key' });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      svcKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error } = await admin.auth.getUser(token);

    if (error || !user?.email) {
      return NextResponse.json({ isPlatformOwner: false, debug: 'auth_failed' });
    }

    const isPlatformOwner = ownerEmails.includes(user.email.toLowerCase());
    return NextResponse.json({ isPlatformOwner, debug: 'ok' });
  } catch (err) {
    return NextResponse.json({ isPlatformOwner: false, debug: 'exception' });
  }
}
