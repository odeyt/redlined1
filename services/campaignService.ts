import { supabase } from '@/lib/supabase';
import { getShopId, getShopIds } from '@/lib/shopStore';

export interface Campaign {
  id: string;
  name: string;
  type: string;
  subject: string;
  messageTemplate: string;
  targetDaysSinceService: number;
  channel: string;
  status: string;
  sentCount: number;
  createdAt: string;
}

export interface EstimateFollowup {
  id: string;
  estimateNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  channel: string;
  message: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

export const CAMPAIGN_TYPES = [
  'Reactivation', 'Due for Service', 'Seasonal', 'Thank You',
  'Declined Work', 'Post-Service Follow-up', 'Fleet PM Reminder', 'Birthday / Anniversary',
];

export const CAMPAIGN_CHANNELS = ['Email', 'SMS', 'Both'];

export const REACTIVATION_TEMPLATES = [
  {
    name: "You're Due for Service",
    type: 'Reactivation',
    subject: "Hey {customer} — your {vehicle} is due for service",
    template: "Hi {customer},\n\nIt's been a while since we last saw your {vehicle}. Based on your service history, you may be due for:\n\n• Oil Change\n• Tire Rotation\n• Multi-Point Inspection\n\nGive us a call or reply to book your next appointment.\n\n{shop_name}\n{shop_phone}",
  },
  {
    name: "Declined Work Reminder",
    type: 'Declined Work',
    subject: "Following up on recommended service for your {vehicle}",
    template: "Hi {customer},\n\nWe wanted to follow up on the service we recommended during your last visit for your {vehicle}. Delaying this service could affect your safety and vehicle reliability.\n\nWe're happy to schedule a time that works for you.\n\n{shop_name}\n{shop_phone}",
  },
  {
    name: "Seasonal Reminder",
    type: 'Seasonal',
    subject: "Get your {vehicle} ready for the season",
    template: "Hi {customer},\n\nThe season is changing and now is the perfect time to make sure your {vehicle} is ready. We recommend:\n\n• Tire check & rotation\n• Battery test\n• Fluid levels inspection\n\nBook your seasonal checkup today!\n\n{shop_name}\n{shop_phone}",
  },
  {
    name: "Thank You + Review Request",
    type: 'Thank You',
    subject: "Thank you for choosing {shop_name}!",
    template: "Hi {customer},\n\nThank you for bringing your {vehicle} to us. We hope everything is running smoothly!\n\nIf you have a moment, we'd love a Google review — it really helps our small shop grow.\n\nSee you next time!\n{shop_name}",
  },
];

function mapCampaign(r: Record<string, unknown>): Campaign {
  return {
    id: r.id as string,
    name: (r.name as string) || '',
    type: (r.type as string) || 'Reactivation',
    subject: (r.subject as string) || '',
    messageTemplate: (r.message_template as string) || '',
    targetDaysSinceService: Number(r.target_days_since_service ?? 180),
    channel: (r.channel as string) || 'Email',
    status: (r.status as string) || 'Draft',
    sentCount: Number(r.sent_count ?? 0),
    createdAt: (r.created_at as string) || '',
  };
}

function mapFollowup(r: Record<string, unknown>): EstimateFollowup {
  return {
    id: r.id as string,
    estimateNumber: (r.estimate_number as string) || '',
    customerName: (r.customer_name as string) || '',
    customerEmail: (r.customer_email as string) || '',
    customerPhone: (r.customer_phone as string) || '',
    channel: (r.channel as string) || 'SMS',
    message: (r.message as string) || '',
    status: (r.status as string) || 'Queued',
    sentAt: (r.sent_at as string) || null,
    createdAt: (r.created_at as string) || '',
  };
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .in('shop_id', getShopIds())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCampaign);
}

export async function createCampaign(c: Omit<Campaign, 'id' | 'createdAt' | 'sentCount'>): Promise<Campaign> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      shop_id: getShopId(),
      name: c.name,
      type: c.type,
      subject: c.subject,
      message_template: c.messageTemplate,
      target_days_since_service: c.targetDaysSinceService,
      channel: c.channel,
      status: c.status,
      sent_count: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return mapCampaign(data);
}

export async function updateCampaign(id: string, updates: Partial<Campaign>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.type !== undefined) payload.type = updates.type;
  if (updates.subject !== undefined) payload.subject = updates.subject;
  if (updates.messageTemplate !== undefined) payload.message_template = updates.messageTemplate;
  if (updates.targetDaysSinceService !== undefined) payload.target_days_since_service = updates.targetDaysSinceService;
  if (updates.channel !== undefined) payload.channel = updates.channel;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.sentCount !== undefined) payload.sent_count = updates.sentCount;
  const { error } = await supabase.from('campaigns').update(payload).eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('campaigns').delete().eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;
}

export async function fetchFollowups(): Promise<EstimateFollowup[]> {
  const { data, error } = await supabase
    .from('estimate_followups')
    .select('*')
    .in('shop_id', getShopIds())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapFollowup);
}

export async function createFollowup(f: Omit<EstimateFollowup, 'id' | 'createdAt' | 'sentAt'>): Promise<EstimateFollowup> {
  const { data, error } = await supabase
    .from('estimate_followups')
    .insert({
      shop_id: getShopId(),
      estimate_number: f.estimateNumber,
      customer_name: f.customerName,
      customer_email: f.customerEmail,
      customer_phone: f.customerPhone,
      channel: f.channel,
      message: f.message,
      status: f.status,
    })
    .select()
    .single();
  if (error) throw error;
  return mapFollowup(data);
}

export async function markFollowupSent(id: string): Promise<void> {
  const { error } = await supabase
    .from('estimate_followups')
    .update({ status: 'Sent', sent_at: new Date().toISOString() })
    .eq('id', id)
    .in('shop_id', getShopIds());
  if (error) throw error;
}

export async function deleteFollowup(id: string): Promise<void> {
  const { error } = await supabase.from('estimate_followups').delete().eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;
}
