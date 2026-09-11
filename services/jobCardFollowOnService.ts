import { createRepairOrder, findRepairOrderByJobCard, nextRONumber } from './repairOrderService';
import { createPartsEstimate, findPartsEstimateByJobCard } from './partsEstimateService';
import { fetchShopSettings, SHOP_PRICING_DEFAULTS } from './shopSettingsService';

/**
 * The repair order and parts quotation that every job card gets.
 *
 * Until this existed, a job card was the only record intake produced. Staff
 * then had to open the job card, press "Repair Order →", save that form,
 * press "Parts Quotation", save again — three screens to reach the state
 * every job ends up in anyway. In practice the later two often never
 * happened: a search for a vehicle's repair order came back empty and the
 * work was already underway, so nothing linked the job to its labour or its
 * parts.
 *
 * Both records are created deliberately empty apart from identity and
 * whatever the technician actually found. Guessing at labour lines or part
 * prices would put figures in front of a customer that nobody quoted, which
 * is worse than a blank form — so this carries who, what and why, and leaves
 * what-it-costs to the person who knows.
 *
 * Asked twice for the same job card, it hands back what is already there.
 * The job card id is the key on both sides (repair_orders.job_card_id,
 * parts_estimates.job_card_number), so a retry, a double tap or a second
 * device finds the first pair rather than opening a second.
 *
 * Never allowed to fail the job card. The job card is what the shop needs to
 * start work; losing it because a follow-on record could not be filed would
 * be the worse outcome, so failures are collected and reported, not thrown.
 * The same reasoning the intake flow already applies to its own session save.
 */

/**
 * The shop's own labour rate and currency, or the defined fallbacks.
 *
 * These used to be two literals here — 145 and 'USD' — which meant a shop
 * that had set its rate to 90, or its currency to THB, still got a repair
 * order opened at $145/hr. RepairOrdersView has always read shop settings for
 * exactly this; the automatic path did not, so the same shop got different
 * answers depending on whether a human or this raised the record.
 *
 * Never allowed to fail the job card, like everything else here: if settings
 * cannot be read, fall back to the same values the settings service itself
 * falls back to, rather than inventing a third answer.
 */
async function pricingContext(): Promise<{ laborRate: number; currency: string }> {
  try {
    const settings = await fetchShopSettings();
    return {
      laborRate: settings?.laborRate ?? SHOP_PRICING_DEFAULTS.laborRate,
      currency:  settings?.defaultCurrency || SHOP_PRICING_DEFAULTS.currency,
    };
  } catch {
    return { laborRate: SHOP_PRICING_DEFAULTS.laborRate, currency: SHOP_PRICING_DEFAULTS.currency };
  }
}

export interface JobCardFollowOnInput {
  /** The job card's id — what both follow-on records link back to. */
  jobCardId: string;
  customerName: string;
  /** Empty when the customer could not be resolved; the RO still saves. */
  customerId: string;
  vehicle: string;
  /** Seeds the RO's concern, so it opens stating why the car is here. */
  serviceType: string;
  notes?: string;
  /**
   * What the technician found, already written out. Lands in the notes of
   * both records so neither opens blank: the RO tells whoever picks up the
   * job what failed, and the quotation tells whoever prices the parts what
   * they are pricing for. Never a price — only what was observed.
   */
  findings?: string;
}

export interface JobCardFollowOnResult {
  /** The RO number in play, or null when the repair order could not be made. */
  roNumber: string | null;
  quotationCreated: boolean;
  /** True when the repair order was already there and was reused. */
  roReused: boolean;
  /** True when the quotation was already there and was reused. */
  quotationReused: boolean;
  /** One message per record that failed. Empty when both succeeded. */
  errors: string[];
}

export async function createJobCardFollowOns(
  input: JobCardFollowOnInput,
): Promise<JobCardFollowOnResult> {
  const errors: string[] = [];
  let roNumber: string | null = null;
  let roReused = false;
  const pricing = await pricingContext();

  try {
    const existing = await findRepairOrderByJobCard(input.jobCardId);
    if (existing) {
      roNumber = existing.roNumber;
      roReused = true;
    } else {
      const num = await nextRONumber();
      await createRepairOrder({
        roNumber:      num,
        jobCardId:     input.jobCardId,
        invoiceNumber: '',
        customerName:  input.customerName,
        // Carried so the repair order is reachable by customer — Vehicle
        // Intake's history panel reads repair_orders by customer_id, and an
        // RO saved without it is invisible there.
        customerId:    input.customerId,
        vehicle:       input.vehicle,
        status:        'Open',
        concern:       input.serviceType || input.notes || '',
        cause:         '',
        correction:    '',
        technician:    '',
        laborHours:    0,
        partsTotal:    0,
        laborRate:     pricing.laborRate,
        notes:         input.findings ?? '',
        currency:      pricing.currency,
        openedDate:    new Date().toISOString(),
        closedDate:    null,
        parts:         [],
        workLines:     [],
        suggestedHours: null,
        flatRateCost:   null,
        laborSource:    null,
        laborLookupAt:  null,
      });
      roNumber = num;
    }
  } catch (e) {
    errors.push(`Repair order: ${e instanceof Error ? e.message : 'unknown error'}`);
  }

  try {
    const existingQuote = await findPartsEstimateByJobCard(input.jobCardId);
    if (existingQuote) {
      return { roNumber, quotationCreated: true, roReused, quotationReused: true, errors };
    }
    await createPartsEstimate({
      lineItems:  [],
      partName:   '',
      partNumber: '',
      condition:  'New',
      quantity:   0,
      unitCost:   0,
      vendorName: '', vendorPhone: '', vendorEmail: '',
      coreCharge: 0,
      totalCost:  0,
      deposit:    0,
      depositCurrency: pricing.currency,
      status:     'Draft',
      quoteDate:  new Date().toISOString().slice(0, 10),
      validUntil: '',
      jobCardNumber: input.jobCardId,
      // Links the quote to the RO raised a moment ago when there is one, so
      // the three records form one chain rather than three loose rows.
      repairOrderNumber: roNumber ?? '',
      vehicle:      input.vehicle,
      customerName: input.customerName,
      notes:        input.findings ?? '',
      currency:     pricing.currency,
    });
    return { roNumber, quotationCreated: true, roReused, quotationReused: false, errors };
  } catch (e) {
    errors.push(`Parts quotation: ${e instanceof Error ? e.message : 'unknown error'}`);
    return { roNumber, quotationCreated: false, roReused, quotationReused: false, errors };
  }
}
