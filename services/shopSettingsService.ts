import { supabase } from '@/lib/supabase';
import { getShopId, getShopIds } from '@/lib/shopStore';

export type RoleKey = 'manager' | 'advisor' | 'technician';
export type RolePermissions = Record<RoleKey, string[]>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  manager: [
    'dashboard', 'triage', 'customers', 'vehicles', 'appointments', 'job-cards',
    'scheduling', 'inspections', 'repair-orders', 'technicians',
    'parts', 'parts-estimates', 'parts-orders', 'parts-received',
    'communication', 'vin', 'dtc', 'diagnostics', 'ai',
  ],
  advisor: [
    'dashboard', 'triage', 'customers', 'vehicles', 'appointments', 'scheduling',
    'job-cards', 'inspections',
    'parts', 'parts-estimates', 'parts-orders',
    'communication', 'vin', 'dtc', 'diagnostics', 'ai',
  ],
  technician: [
    'dashboard', 'job-cards', 'inspections', 'repair-orders', 'parts',
  ],
};

export interface MessagingSettings {
  twilioSid: string;
  twilioToken: string;
  twilioFrom: string;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  lineEnabled: boolean;
  lineToken: string;
  telegramEnabled: boolean;
  telegramBotToken: string;
}

export const DEFAULT_MESSAGING: MessagingSettings = {
  twilioSid: '', twilioToken: '', twilioFrom: '',
  smsEnabled: false, whatsappEnabled: false,
  lineEnabled: false, lineToken: '',
  telegramEnabled: false, telegramBotToken: '',
};

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
  rolePermissions: RolePermissions;
  inspectionTemplate: Array<{ category: string; name: string }> | null;
  enableTimeTracking: boolean;
  enableJobArchive: boolean;
  enableVehiclePhotos: boolean;
  enableVehicleEdit: boolean;
  enableTechnicianReport: boolean;
  enableJobCompletionReport: boolean;
  enableAppointmentBay: boolean;
  appointmentBays: string[];
  enableJobCardPriority: boolean;
  enableJobCardBranchRoute: boolean;
  enableJobCardServiceLocation: boolean;
  enableJobCardApprovalCode: boolean;
  enableJobCardSubType: boolean;
  serviceSubTypes: Record<string, string[]>;
  messaging: MessagingSettings;
}

export const DEFAULT_PAYMENT_METHODS = [
  'Cash', 'Check', 'Credit Card', 'Debit Card',
  'Apple Pay', 'Google Pay', 'Zelle', 'Venmo', 'PayPal', 'Cash App', 'Wise',
  'Bank Transfer', 'Fleet Account',
];

export async function fetchShopSettings(): Promise<ShopSettings> {
  // Use the single active shop — .in() with mirror IDs + .single() throws when both shops
  // have settings rows (PGRST116 "multiple rows returned"). Settings are always per-shop.
  const { data, error } = await supabase
    .from('shop_settings')
    .select('*')
    .eq('shop_id', getShopId())
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return {
    companyName: data?.company_name ?? 'D1 Imports',
    tagline: data?.tagline ?? 'Service, fleet, mobile, parts',
    logoUrl: data?.logo_url ?? null,
    address: data?.address ?? '',
    phone: data?.phone ?? '',
    email: data?.email ?? '',
    website: data?.website ?? '',
    hiddenModules: data?.hidden_modules ?? [],
    rolePermissions: data?.role_permissions && Object.keys(data.role_permissions).length > 0
      ? data.role_permissions as RolePermissions
      : DEFAULT_ROLE_PERMISSIONS,
    laborRate: Number(data?.labor_rate ?? 145),
    defaultTaxRate: Number(data?.default_tax_rate ?? 0.08),
    invoicePrefix: data?.invoice_prefix ?? 'INV-',
    estimatePrefix: data?.estimate_prefix ?? 'EST-',
    businessType: data?.business_type ?? 'Single repair shop',
    serviceTypes: data?.service_types ?? 'Oil Change,Brakes,Tires,Alignment,Engine,Transmission,Electrical,AC/Heat,Diagnostics,Inspection,Detailing,Custom',
    enabledPaymentMethods: (data?.enabled_payment_methods as string[] | null) ?? DEFAULT_PAYMENT_METHODS,
    inspectionTemplate: data?.inspection_template ?? null,
    enableTimeTracking: data?.enable_time_tracking ?? true,
    enableJobArchive: data?.enable_job_archive ?? true,
    enableVehiclePhotos: data?.enable_vehicle_photos ?? true,
    enableVehicleEdit: data?.enable_vehicle_edit ?? true,
    enableTechnicianReport: data?.enable_technician_report ?? true,
    enableJobCompletionReport: data?.enable_job_completion_report ?? true,
    enableAppointmentBay: data?.enable_appointment_bay ?? true,
    appointmentBays: (data?.appointment_bays as string[] | null) ?? ['D1 Shop 1', 'D1 Shop 2'],
    enableJobCardPriority: data?.enable_job_card_priority ?? true,
    enableJobCardBranchRoute: data?.enable_job_card_branch_route ?? true,
    enableJobCardServiceLocation: data?.enable_job_card_service_location ?? true,
    enableJobCardApprovalCode: data?.enable_job_card_approval_code ?? true,
    enableJobCardSubType: data?.enable_job_card_sub_type ?? true,
    messaging: { ...DEFAULT_MESSAGING, ...(data?.messaging_settings as Partial<MessagingSettings> | null ?? {}) },
    serviceSubTypes: (data?.service_sub_types as Record<string, string[]> | null) ?? {
      'Oil Change': ['5W-30', '0W-20', '5W-40', '10W-30', '10W-40', 'Synthetic', 'Semi-Synthetic', 'Conventional'],
      'Brakes': ['Front Passenger (FP)', 'Driver Side (D)', 'Passenger Rear (PR)', 'Driver Rear (DR)', 'All Four', 'Front Axle', 'Rear Axle'],
      'Tires': ['Front Left', 'Front Right', 'Rear Left', 'Rear Right', 'All Four', 'Rotation Only'],
      'Alignment': ['Front Only', '4-Wheel', 'Thrust Angle'],
      'Engine': ['Tune-Up', 'Timing Belt', 'Head Gasket', 'Oil Leak', 'Coolant Leak', 'Starter', 'Alternator'],
      'Transmission': ['Service/Flush', 'Filter Change', 'Rebuild', 'Replacement', 'Solenoid'],
      'Electrical': ['Battery', 'Alternator', 'Starter', 'Fuses', 'Wiring', 'Sensors'],
      'AC/Heat': ['Recharge', 'Compressor', 'Condenser', 'Evaporator', 'Blower Motor', 'Heater Core'],
      'Diagnostics': ['Check Engine', 'ABS', 'Airbag', 'Transmission', 'Electrical', 'Full Scan'],
      'Inspection': ['Pre-Purchase', 'Safety', 'Emissions', 'Full Vehicle'],
      'Detailing': ['Interior', 'Exterior', 'Full Detail', 'Engine Bay', 'Paint Correction'],
    },
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
  if (settings.inspectionTemplate !== undefined) update.inspection_template = settings.inspectionTemplate;
  if (settings.enableTimeTracking !== undefined) update.enable_time_tracking = settings.enableTimeTracking;
  if (settings.enableJobArchive !== undefined) update.enable_job_archive = settings.enableJobArchive;
  if (settings.enableVehiclePhotos !== undefined) update.enable_vehicle_photos = settings.enableVehiclePhotos;
  if (settings.enableVehicleEdit !== undefined) update.enable_vehicle_edit = settings.enableVehicleEdit;
  if (settings.enableTechnicianReport !== undefined) update.enable_technician_report = settings.enableTechnicianReport;
  if (settings.enableJobCompletionReport !== undefined) update.enable_job_completion_report = settings.enableJobCompletionReport;
  if (settings.enableAppointmentBay !== undefined) update.enable_appointment_bay = settings.enableAppointmentBay;
  if (settings.appointmentBays !== undefined) update.appointment_bays = settings.appointmentBays;
  if (settings.enableJobCardPriority !== undefined) update.enable_job_card_priority = settings.enableJobCardPriority;
  if (settings.enableJobCardBranchRoute !== undefined) update.enable_job_card_branch_route = settings.enableJobCardBranchRoute;
  if (settings.enableJobCardServiceLocation !== undefined) update.enable_job_card_service_location = settings.enableJobCardServiceLocation;
  if (settings.enableJobCardApprovalCode !== undefined) update.enable_job_card_approval_code = settings.enableJobCardApprovalCode;
  if (settings.enableJobCardSubType !== undefined) update.enable_job_card_sub_type = settings.enableJobCardSubType;
  if (settings.serviceSubTypes !== undefined) update.service_sub_types = settings.serviceSubTypes;
  if (settings.messaging !== undefined) update.messaging_settings = settings.messaging;

  // Role permissions must be consistent across all shops the owner controls —
  // save to every shop the current user has access to, not just mirror-active ones.
  // Other settings save only to the active+mirror scope.
  if (settings.rolePermissions !== undefined) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: suRows } = await supabase
        .from('shop_users')
        .select('shop_id')
        .eq('user_id', user.id);
      const allShopIds = (suRows ?? []).map((r: Record<string, unknown>) => r.shop_id as string).filter(Boolean);
      if (allShopIds.length > 0) {
        await supabase
          .from('shop_settings')
          .update({ role_permissions: settings.rolePermissions })
          .in('shop_id', allShopIds);
      }
    }
    // If other settings are also being saved, don't re-save role_permissions below
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from('shop_settings')
      .update(update)
      .in('shop_id', getShopIds());
    if (error) throw error;
  }
}

export async function uploadLogo(file: File): Promise<string> {
  const shopId = getShopId();
  const ext = file.name.split('.').pop();
  const path = `logo/${shopId}/shop-logo.${ext}`;
  const { error } = await supabase.storage
    .from('shop-assets')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('shop-assets').getPublicUrl(path);
  return data.publicUrl + '?t=' + Date.now();
}
