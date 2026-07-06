import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/supabaseServer';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const supabase = getAdminDb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only owners can view test results
  const { data: profile } = await supabase
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
