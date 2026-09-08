import { createRepairOrder, nextRONumber } from './repairOrderService';
import { createPartsEstimate } from './partsEstimateService';

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
 * Both records are created deliberately empty apart from identity. Guessing
 * at labour lines or parts would put figures in front of a customer that
 * nobody quoted, which is worse than a blank form — so this carries who and
 * what, and leaves what-it-costs to the person who knows.
 *
 * Never allowed to fail the job card. The job card is what the shop needs to
 * start work; losing it because a follow-on record could not be filed would
 * be the worse outcome, so failures are collected and reported, not thrown.
 * The same reasoning the intake flow already applies to its own session save.
 */

/** Matches RepairOrdersView's EMPTY_FORM, so an auto-created RO opens
 *  identically to one raised by hand. */
const DEFAULT_LABOR_RATE = 145;
const DEFAULT_CURRENCY = 'USD';

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
}

export interface JobCardFollowOnResult {
  /** The RO number created, or null when the repair order could not be made. */
  roNumber: string | null;
  quotationCreated: boolean;
  /** One message per record that failed. Empty when both succeeded. */
  errors: string[];
}

export async function createJobCardFollowOns(
  input: JobCardFollowOnInput,
): Promise<JobCardFollowOnResult> {
  const errors: string[] = [];
  let roNumber: string | null = null;

  try {
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
      laborRate:     DEFAULT_LABOR_RATE,
      notes:         '',
      currency:      DEFAULT_CURRENCY,
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
  } catch (e) {
    errors.push(`Repair order: ${e instanceof Error ? e.message : 'unknown error'}`);
  }

  try {
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
      depositCurrency: DEFAULT_CURRENCY,
      status:     'Draft',
      quoteDate:  new Date().toISOString().slice(0, 10),
      validUntil: '',
      jobCardNumber: input.jobCardId,
      // Links the quote to the RO raised a moment ago when there is one, so
      // the three records form one chain rather than three loose rows.
      repairOrderNumber: roNumber ?? '',
      vehicle:      input.vehicle,
      customerName: input.customerName,
      notes:        '',
      currency:     DEFAULT_CURRENCY,
    });
    return { roNumber, quotationCreated: true, errors };
  } catch (e) {
    errors.push(`Parts quotation: ${e instanceof Error ? e.message : 'unknown error'}`);
    return { roNumber, quotationCreated: false, errors };
  }
}
