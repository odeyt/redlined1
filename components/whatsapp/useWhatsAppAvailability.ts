'use client';

/**
 * Whether the Send WhatsApp action should appear for the active shop.
 *
 * Shown only when ALL of: the `whatsapp_business` flag is on, the active shop
 * is the pilot shop, and the server says the integration is available. The
 * button appears once connected (so staff can see why it cannot send yet);
 * the dialog shows the reason. One request per shop per minute, shared by
 * every button on the page.
 */
import { useEffect, useState } from 'react';
import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import { getShopId } from '@/lib/shopStore';
import { WHATSAPP_FLAG_KEY, isWhatsAppPilotShop } from '@/lib/whatsapp/config';
import { fetchWhatsAppStatus, type WaConnectionStatus } from '@/services/whatsappService';

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<WaConnectionStatus | null> }>();

export function invalidateWhatsAppAvailability(): void {
  cache.clear();
}

function load(shopId: string): Promise<WaConnectionStatus | null> {
  const hit = cache.get(shopId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = fetchWhatsAppStatus(shopId).catch(() => null);
  cache.set(shopId, { at: Date.now(), value });
  return value;
}

export function useWhatsAppAvailability(): { visible: boolean; status: WaConnectionStatus | null; shopId: string } {
  const flagOn = useFeatureFlag(WHATSAPP_FLAG_KEY);
  const shopId = getShopId();
  const pilot = isWhatsAppPilotShop(shopId);
  const [status, setStatus] = useState<WaConnectionStatus | null>(null);

  useEffect(() => {
    let alive = true;
    if (!flagOn || !pilot) return;
    load(shopId).then(s => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, [flagOn, pilot, shopId]);

  const visible = flagOn && pilot && !!status?.available && status.status === 'connected';
  return { visible, status, shopId };
}
