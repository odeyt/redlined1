import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Which build is actually serving this request.
 *
 * Several hours went into a disagreement between what was deployed and what a
 * browser was running, with no way to tell the two apart from outside. The
 * commit sha turns that from an inference into a lookup.
 *
 * no-store matters as much as the value does: a cached version endpoint would
 * report the build it was cached from, which is exactly the failure it exists
 * to detect.
 */
function payload() {
  return {
    ok: true,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
    time: new Date().toISOString(),
  };
}

const headers = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET() {
  return NextResponse.json(payload(), { headers });
}

export async function POST() {
  return NextResponse.json(payload(), { headers });
}
