import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import type { WidgetLayoutItem } from '@/lib/dashboardWidgets/types';

/**
 * Per-user, per-shop dashboard layout persistence. Unlike shopSettingsService
 * (one pre-seeded row per shop, update-only), a layout row genuinely may not
 * exist yet — first customization creates it, hence upsert/maybeSingle here.
 */

export async function fetchDashboardLayout(page: string = 'dashboard'): Promise<WidgetLayoutItem[] | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('dashboard_layouts')
    .select('widgets')
    .eq('user_id', user.id)
    .eq('shop_id', getShopId())
    .eq('page', page)
    .maybeSingle();
  if (error) throw error;
  return (data?.widgets as WidgetLayoutItem[] | undefined) ?? null;
}

export async function saveDashboardLayout(widgets: WidgetLayoutItem[], page: string = 'dashboard'): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('dashboard_layouts')
    .upsert(
      { user_id: user.id, shop_id: getShopId(), page, widgets },
      { onConflict: 'user_id,shop_id,page' }
    );
  if (error) throw error;
}

export async function resetDashboardLayout(page: string = 'dashboard'): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('dashboard_layouts')
    .delete()
    .eq('user_id', user.id)
    .eq('shop_id', getShopId())
    .eq('page', page);
  if (error) throw error;
}
