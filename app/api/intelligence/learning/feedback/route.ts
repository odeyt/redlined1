export const dynamic = 'force-dynamic'
// SI-11: POST /api/intelligence/learning/feedback
// Auth required. Validates input. Calls submitFeedback engine function.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { submitFeedback } from '@/intelligence/learning/IntelligenceLearningEngine';
import type { RecommendationFeedbackType } from '@/intelligence/learning/types';

const ALLOWED_FEEDBACK_TYPES: RecommendationFeedbackType[] = [
  'correct',
  'incorrect',
  'partially_correct',
  'useful',
  'not_useful',
  'needs_more_information',
];

async function getAuth() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
}

async function checkFlag(key: string): Promise<boolean> {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  const db = getAdminDb();
  const { data } = await db.from('feature_flags').select('enabled').eq('flag_key', key).maybeSingle();
  return !!(data as { enabled?: boolean } | null)?.enabled;
}

async function getShopId(authClient: ReturnType<typeof createServerClient>, userId: string): Promise<string | null> {
  const { data } = await authClient.from('shop_users').select('shop_id').eq('user_id', userId).limit(1).maybeSingle();
  return (data as { shop_id: string } | null)?.shop_id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await getAuth();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const flagOn = await checkFlag('recommendation_feedback');
    if (!flagOn) return NextResponse.json({ disabled: true, ok: false }, { status: 200 });

    const shopId = await getShopId(authClient, user.id);
    if (!shopId) return NextResponse.json({ error: 'No shop' }, { status: 403 });

    const body = await req.json() as {
      recommendationId?: string;
      feedbackType?: string;
      usefulnessScore?: number;
      accuracyScore?: number;
      trustScore?: number;
      resultStatus?: string;
      reasonCode?: string;
      comment?: string;
    };

    if (!body.recommendationId) {
      return NextResponse.json({ ok: false, error: 'recommendationId required' }, { status: 400 });
    }
    if (!body.feedbackType || !ALLOWED_FEEDBACK_TYPES.includes(body.feedbackType as RecommendationFeedbackType)) {
      return NextResponse.json({ ok: false, error: `feedbackType must be one of: ${ALLOWED_FEEDBACK_TYPES.join(', ')}` }, { status: 400 });
    }
    if (body.usefulnessScore !== undefined && (body.usefulnessScore < 1 || body.usefulnessScore > 5)) {
      return NextResponse.json({ ok: false, error: 'usefulnessScore must be 1-5' }, { status: 400 });
    }
    if (body.accuracyScore !== undefined && (body.accuracyScore < 1 || body.accuracyScore > 5)) {
      return NextResponse.json({ ok: false, error: 'accuracyScore must be 1-5' }, { status: 400 });
    }
    if (body.trustScore !== undefined && (body.trustScore < 1 || body.trustScore > 5)) {
      return NextResponse.json({ ok: false, error: 'trustScore must be 1-5' }, { status: 400 });
    }

    const result = await submitFeedback(shopId, user.id, {
      recommendationId: body.recommendationId,
      feedbackType:     body.feedbackType as RecommendationFeedbackType,
      usefulnessScore:  body.usefulnessScore,
      accuracyScore:    body.accuracyScore,
      trustScore:       body.trustScore,
      resultStatus:     body.resultStatus as import('@/intelligence/learning/types').RecommendationResultStatus | undefined,
      reasonCode:       body.reasonCode,
      comment:          body.comment,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
