import { supabase } from '@/lib/supabase';

export interface ShopSettings {
  companyName: string;
  tagline: string;
  logoUrl: string | null;
  address: string;
  phone: string;
  email: string;
  website: string;
  hiddenModules: string[];
  laborRate: number;
  defaultTaxRate: number;
  invoicePrefix: string;
  estimatePrefix: string;
  businessType: string;
  serviceTypes: string;
  enabledPaymentMethods: string[];
}

/* Default set that covers most auto repair shops out of the box */
export const DEFAULT_PAYMENT_METHODS = [
  'Cash', 'Check', 'Credit Card', 'Debit Card',
  'Apple Pay', 'Google Pay', 'Zelle', 'Venmo',
  'Fleet Account',
];

export async function fetchShopSettings(): Promise<ShopSettings> {
  const { data, error } = await supabase
    .from('shop_settings')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return {
    companyName: data.company_name ?? 'Redlined1',
    tagline: data.tagline ?? 'Service, fleet, mobile, parts',
    logoUrl: data.logo_url ?? null,
    address: data.address ?? '',
    phone: data.phone ?? '',
    email: data.email ?? '',
    website: data.website ?? '',
    hiddenModules: data.hidden_modules ?? [],
    laborRate: Number(data.labor_rate ?? 145),
    defaultTaxRate: Number(data.default_tax_rate ?? 0.08),
    invoicePrefix: data.invoice_prefix ?? 'INV-',
    estimatePrefix: data.estimate_prefix ?? 'EST-',
    businessType: data.business_type ?? 'Single repair shop',
    serviceTypes: data.service_types ?? 'Oil Change,Brakes,Tires,Alignment,Engine,Transmission,Electrical,AC/Heat,Diagnostics,Inspection,Detailing,Custom',
    enabledPaymentMethods: data.enabled_payment_methods ?? DEFAULT_PAYMENT_METHODS,
  };
}

export async function saveShopSettings(settings: Partial<ShopSettings>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (settings.companyName !== undefined) update.company_name = settings.companyName;
  if (settings.tagline !== undefined) update.tagline = settings.tagline;
  if (settings.logoUrl !== undefined) update.logo_url = settings.logoUrl;
  if (settings.address !== undefined) update.address = settings.address;
  if (settings.phone !== undefined) update.phone = settings.phone;
  if (settings.email !== undefined) update.email = settings.email;
  if (settings.website !== undefined) update.website = settings.website;
  if (settings.hiddenModules !== undefined) update.hidden_modules = settings.hiddenModules;
  if (settings.laborRate !== undefined) update.labor_rate = settings.laborRate;
  if (settings.defaultTaxRate !== undefined) update.default_tax_rate = settings.defaultTaxRate;
  if (settings.invoicePrefix !== undefined) update.invoice_prefix = settings.invoicePrefix;
  if (settings.estimatePrefix !== undefined) update.estimate_prefix = settings.estimatePrefix;
  if (settings.businessType !== undefined) update.business_type = settings.businessType;
  if (settings.serviceTypes !== undefined) update.service_types = settings.serviceTypes;
  if (settings.enabledPaymentMethods !== undefined) update.enabled_payment_methods = settings.enabledPaymentMethods;
  const { error } = await supabase.from('shop_settings').update(update).eq('id', 1);
  if (error) throw error;
}

export async function uploadLogo(file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `logo/shop-logo.${ext}`;
  const { error } = await supabase.storage
    .from('shop-assets')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('shop-assets').getPublicUrl(path);
  return data.publicUrl + '?t=' + Date.now();
}
