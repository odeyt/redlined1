export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return Response.json({
    sb_url_set: url.length > 0,
    sb_url_prefix: url.slice(0, 30) || '(empty)',
    sb_key_set: key.length > 0,
    sb_key_prefix: key.slice(0, 20) || '(empty)',
  });
}
