import { NextRequest, NextResponse } from 'next/server';
import { requireShopRole } from '@/lib/serverAuth';
import { getPhotoLimit, PhotoEntityType } from '@/lib/photos/photoLimits';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shopId   = searchParams.get('shopId')   ?? '';
  const type     = searchParams.get('type')     as PhotoEntityType | null;
  const entityId = searchParams.get('entityId') ?? '';

  if (!shopId || !type || !entityId) {
    return NextResponse.json(
      { error: 'shopId, type, and entityId are required' },
      { status: 400 },
    );
  }

  if (!['vehicle', 'entity', 'part'].includes(type)) {
    return NextResponse.json({ error: 'type must be vehicle, entity, or part' }, { status: 400 });
  }

  const auth = await requireShopRole(req, shopId, ['owner', 'manager', 'advisor', 'technician']);
  if (!auth.ok) return auth.response;

  try {
    const result = await getPhotoLimit(shopId, type, entityId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
