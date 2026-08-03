import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  // Playwright regression results belong to whoever runs the platform.
  //
  // This gated on profiles.role === 'owner', which is a SHOP role: it says a
  // person owns their own garage, not that they operate this SaaS. Two
  // consequences, both wrong in opposite directions:
  //
  //   - any customer whose profiles.role read 'owner' would have been served
  //     our internal test output
  //   - the actual platform owner is 'Technician' in that column (10 of 11
  //     accounts are), so the person the page exists for got Forbidden
  //
  // verifyPlatformOwner is the established check for this — PLATFORM_OWNER_EMAIL,
  // server-side only, comma-separated, accepting a bearer token or a cookie
  // session. It is what /api/admin/me and the admin routes already use.
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason)
      : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resultsPath = path.join(process.cwd(), 'tests', 'reports', 'results.json');
    if (!fs.existsSync(resultsPath)) {
      return NextResponse.json({ results: null, message: 'No test results found. Run: npm run test:e2e' });
    }
    const raw  = fs.readFileSync(resultsPath, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json({ results: data });
  } catch {
    return NextResponse.json({ error: 'Failed to read test results' }, { status: 500 });
  }
}
