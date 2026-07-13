import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner } from '@/lib/adminAuth';

// Lightweight endpoint the sidebar calls to determine whether to show
// the platform-owner nav link. Returns {isPlatformOwner: bool}.
// Uses the same server-side PLATFORM_OWNER_EMAIL check as the dashboard page —
// never relies on a baked-in NEXT_PUBLIC_ var.
export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  return NextResponse.json({ isPlatformOwner: auth.authorized });
}
