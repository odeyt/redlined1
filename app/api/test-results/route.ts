import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/supabaseServer';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminDb = getAdminDb();
  const { data: profile } = await adminDb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
