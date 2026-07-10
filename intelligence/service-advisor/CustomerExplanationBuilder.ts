// SI-12: Customer Explanation Builder — deterministic, template-based, editable

import { supabase } from '@/lib/supabase';
import type {
  ServiceAdvisorContext,
  CustomerExplanation,
  FindingExplanationItem,
  AdvisorTemplate,
} from './types';

const DISCLAIMER = 'This explanation was prepared by your service advisor based on our inspection findings. Please review with your advisor before any decisions are made. All repairs are subject to technician verification.';

export async function buildEstimateOverview(context: ServiceAdvisorContext): Promise<string> {
  const template = await getTemplate(context.shopId, 'repair_overview_en', 'estimate_overview');
  const vehicle = context.vehicle;
  const lineCount = context.estimate?.lineCount ?? 0;
  const safetyCount = (context.inspection?.findings ?? []).filter(f => f.isSafety).length;

  const findingSummary = safetyCount > 0
    ? `${lineCount} service item(s) including ${safetyCount} safety concern(s) are recommended.`
    : `${lineCount} service item(s) are recommended.`;

  return fillTemplate(template.content, {
    year: String(vehicle?.year ?? ''),
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    finding_summary: findingSummary,
  });
}

export function buildFindingExplanation(
  finding: { id: string; name: string; category: string; condition: string | null; notes: string | null; isSafety: boolean },
  _template: AdvisorTemplate | null
): FindingExplanationItem {
  const condition = finding.condition ?? 'concern noted';
  const whatWasFound = `During inspection, we found: ${finding.name} — ${condition}.`;
  const whyItMatters = finding.isSafety
    ? 'This item affects vehicle safety and should be addressed promptly.'
    : `This is a maintenance or repair item in the ${finding.category} category.`;
  const recommendation = `We recommend addressing this item to maintain ${finding.isSafety ? 'safe vehicle operation' : 'proper vehicle function'}.`;
  const consequenceIfIgnored = finding.isSafety
    ? 'If left unaddressed, this may create a safety risk.'
    : null;

  return {
    findingId: finding.id,
    findingName: finding.name,
    whatWasFound,
    whyItMatters,
    recommendation,
    consequenceIfIgnored,
    isSafety: finding.isSafety,
  };
}

export function buildRepairExplanation(
  line: { description: string | null; total: number; currency: string | null },
  _evidence: unknown
): string {
  const desc = line.description ?? 'service item';
  const price = line.total > 0 ? ` — estimated ${line.currency ?? 'USD'} ${line.total.toFixed(2)}` : '';
  return `${desc}${price}. This repair addresses the concern described above.`;
}

export function buildSafetyExplanation(
  finding: { name: string; notes: string | null }
): string {
  return `Safety Item: ${finding.name}. ${finding.notes ?? ''} We recommend addressing this before your next drive.`;
}

export function buildBenefitExplanation(
  line: { description: string | null; lineType: string | null }
): string {
  const desc = line.description ?? 'this service';
  return `Completing ${desc} will help maintain your vehicle's reliability and performance.`;
}

export function buildDeclinedWorkExplanation(
  item: { description: string; declinedDate: string | null }
): string {
  const dateStr = item.declinedDate ? ` on ${item.declinedDate}` : '';
  return `During a previous visit${dateStr}, we recommended: ${item.description}. This item was noted as declined. The concern may still apply — please let us know if you would like to revisit this service.`;
}

export async function buildPlainLanguageSummary(context: ServiceAdvisorContext): Promise<string> {
  const vehicle = context.vehicle;
  const vehicleStr = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'your vehicle';
  const lineCount = context.estimate?.lineCount ?? 0;
  const safetyCount = (context.inspection?.findings ?? []).filter(f => f.isSafety && !f.hasEstimateLine).length;
  const declinedCount = context.customer?.priorDeclinedCount ?? 0;

  const parts: string[] = [];
  parts.push(`We inspected ${vehicleStr} and prepared an estimate with ${lineCount} service item(s).`);
  if (safetyCount > 0) parts.push(`${safetyCount} safety concern(s) were identified.`);
  if (declinedCount > 0) parts.push(`${declinedCount} previously declined service item(s) may still apply.`);
  parts.push('Please review the details below and let us know if you have any questions.');

  return parts.join(' ');
}

export function buildLaoPlaceholderStructure(context: ServiceAdvisorContext): Record<string, string> {
  return {
    language: 'lo',
    status: 'placeholder',
    note: 'Lao language support is prepared as a template architecture. Live translations require future activation.',
    vehicleRef: `${context.vehicle?.year ?? ''} ${context.vehicle?.make ?? ''} ${context.vehicle?.model ?? ''}`.trim(),
  };
}

export async function buildCustomerExplanation(context: ServiceAdvisorContext): Promise<CustomerExplanation> {
  const [overview, summary] = await Promise.all([
    buildEstimateOverview(context).catch(() => 'Estimate overview unavailable.'),
    buildPlainLanguageSummary(context).catch(() => 'Summary unavailable.'),
  ]);

  const findings = context.inspection?.findings ?? [];
  const findingExplanations: FindingExplanationItem[] = findings
    .filter(f => f.name && f.name.trim().length > 0)
    .map(f => buildFindingExplanation(f, null));

  const safetyItems = findings
    .filter(f => f.isSafety)
    .map(f => buildSafetyExplanation(f));

  const declinedWorkReminders = (context.customer?.priorDeclinedItems ?? [])
    .slice(0, 3)
    .map(d => buildDeclinedWorkExplanation(d));

  return {
    estimateId: context.estimate?.estimateId ?? null,
    overview,
    findingExplanations,
    safetyItems,
    declinedWorkReminders,
    plainLanguageSummary: summary,
    language: 'en',
    isEditable: true,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };
}

async function getTemplate(
  shopId: string,
  templateKey: string,
  templateType: string
): Promise<AdvisorTemplate> {
  try {
    // Try shop-specific first, fall back to system template
    const { data } = await supabase
      .from('advisor_templates')
      .select('*')
      .eq('template_key', templateKey)
      .eq('is_active', true)
      .in('shop_id', [shopId, null as unknown as string])
      .order('is_system', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data) {
      return {
        id: data.id,
        shopId: data.shop_id ?? null,
        templateKey: data.template_key,
        templateType: data.template_type,
        name: data.name,
        content: data.content,
        language: data.language,
        isSystem: data.is_system,
        isActive: data.is_active,
        metadata: data.metadata ?? {},
      };
    }
  } catch {
    // Fall through to default
  }

  // Hardcoded fallback
  return {
    id: 'default',
    shopId: null,
    templateKey,
    templateType,
    name: 'Default',
    content: 'We inspected your {year} {make} {model}. {finding_summary}',
    language: 'en',
    isSystem: true,
    isActive: true,
    metadata: {},
  };
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
