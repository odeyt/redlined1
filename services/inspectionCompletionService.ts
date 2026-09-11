import {
  claimInspectionJobCard, updateInspection,
  type Inspection, type InspectionItem,
} from './inspectionService';
import { createJobCard, fetchJobCardById } from './jobCardService';
import { createJobCardFollowOns } from './jobCardFollowOnService';

/**
 * Marking an inspection complete is what starts the job.
 *
 * The workflow a shop actually runs is intake → inspection → job. Until this
 * existed only the two ends were wired: intake could hand straight off to a
 * job card, and "Mark Complete" set a status and stopped. A technician who
 * went the proper way round — inspect first, then decide what work to quote —
 * finished with a green inspection and nothing to work from, and had to
 * retype every finding into a job card by hand. Whether the job existed at
 * all depended on which button somebody happened to press at the front desk.
 *
 * So the three records are raised here, at the point the findings are known,
 * rather than at intake where there is nothing to say yet beyond the
 * customer's complaint. The job card carries the findings as its notes, the
 * repair order opens stating what failed, and the parts quotation opens as a
 * Draft with the same context and no prices — nobody has quoted anything, and
 * a number nobody stands behind is worse than a blank field.
 *
 * Pressed twice, it must still leave one of each. See claimInspectionJobCard
 * for how the job card id is settled; the repair order and quotation are then
 * keyed off that id, so both sides of a race converge on the same three
 * records. What remains unguarded is two callers arriving within the same few
 * milliseconds on *different* devices: the loser of the id race can reach the
 * repair-order lookup before the winner's insert lands, and raise a second
 * one. A unique index on repair_orders(job_card_id) would close it, but some
 * jobs legitimately carry more than one RO, so that is the owner's call and a
 * migration, not something to assume here.
 */

export interface InspectionCompletionResult {
  /** The job card the inspection now names. Always set on success. */
  jobCardId: string;
  /** The repair order in play, or null when it could not be raised. */
  roNumber: string | null;
  quotationCreated: boolean;
  /** False when the job card was already there — i.e. this was a repeat. */
  createdJobCard: boolean;
  roReused: boolean;
  quotationReused: boolean;
  /** Nothing new was created: every record already existed. */
  alreadyComplete: boolean;
  /** One message per record that could not be filed. */
  errors: string[];
}

/** Inspection categories whose name maps cleanly onto a job card service
 *  type. Anything ambiguous is deliberately absent — a wrong service type
 *  routes the job to the wrong bay, and "Inspection" is at least true. */
const CATEGORY_TO_SERVICE_TYPE: Record<string, string> = {
  'Brakes':     'Brakes',
  'Tires':      'Tires',
  'Suspension': 'Suspension',
  'Lights':     'Electrical',
};

const FALLBACK_SERVICE_TYPE = 'Inspection';

function isActionable(item: InspectionItem): boolean {
  return item.status === 'Fail' || item.status === 'Attention';
}

/** Strips the "— Triage Checks" suffix createInspectionFromTriage adds, so a
 *  triage-seeded brake item still reads as Brakes. */
function baseCategory(category: string): string {
  return category.split('—')[0].trim();
}

/**
 * What the technician found, written out for somebody who was not there.
 *
 * This is the whole point of raising the job here rather than at intake: the
 * job card, repair order and quotation each open already stating what failed,
 * so nobody retypes the inspection. Kept to what was observed — item, status
 * and the technician's own note. No prices, no recommended parts, no severity
 * the technician did not set.
 */
export function summariseInspectionFindings(inspection: Inspection): string {
  const failed    = inspection.items.filter(i => i.status === 'Fail');
  const attention = inspection.items.filter(i => i.status === 'Attention');
  const photos    = inspection.items.filter(i => isActionable(i) && i.photoUrl).length;

  const line = (i: InspectionItem) => {
    const note = i.notes.trim();
    return '• ' + baseCategory(i.category) + ' — ' + i.name + (note ? ': ' + note : '');
  };

  const parts: string[] = [];
  const header = [
    inspection.inspectionNumber,
    inspection.vehicle,
    inspection.mileage ? inspection.mileage.toLocaleString() + ' mi' : '',
    inspection.technician ? 'Tech: ' + inspection.technician : '',
  ].filter(Boolean).join(' · ');
  if (header) parts.push(header);

  // The intake complaint lives here — createInspectionFromTriage writes the
  // triage summary into notes, so this is the customer's own words.
  if (inspection.notes.trim()) parts.push('Concern:\n' + inspection.notes.trim());

  if (failed.length) {
    parts.push('Failed (' + failed.length + '):\n' + failed.map(line).join('\n'));
  }
  if (attention.length) {
    parts.push('Needs attention (' + attention.length + '):\n' + attention.map(line).join('\n'));
  }
  if (!failed.length && !attention.length) parts.push('No failed or flagged items.');
  if (photos) {
    parts.push(photos + ' photo' + (photos === 1 ? '' : 's') + ' attached to the inspection.');
  }

  return parts.join('\n\n');
}

/** The service type the findings point at, or "Inspection" when they point at
 *  more than one thing — or at nothing in particular. */
export function serviceTypeFromFindings(inspection: Inspection): string {
  const categories = new Set(
    inspection.items.filter(i => i.status === 'Fail').map(i => baseCategory(i.category)),
  );
  if (categories.size !== 1) return FALLBACK_SERVICE_TYPE;
  const only = [...categories][0];
  return CATEGORY_TO_SERVICE_TYPE[only] ?? FALLBACK_SERVICE_TYPE;
}

/**
 * One in-flight completion per inspection.
 *
 * A double tap inside one tab shares the first promise rather than racing the
 * database for it. This is a convenience, not the guard — the guard is
 * claimInspectionJobCard, which is what holds when the second press comes
 * from a different tab, a different phone, or a retried request.
 */
const inFlight = new Map<string, Promise<InspectionCompletionResult>>();

export function completeInspection(inspection: Inspection): Promise<InspectionCompletionResult> {
  const existing = inFlight.get(inspection.id);
  if (existing) return existing;
  const run = runCompletion(inspection).finally(() => inFlight.delete(inspection.id));
  inFlight.set(inspection.id, run);
  return run;
}

async function runCompletion(inspection: Inspection): Promise<InspectionCompletionResult> {
  const findings    = summariseInspectionFindings(inspection);
  const serviceType = serviceTypeFromFindings(inspection);

  // Settle the id first. Every record below hangs off it, and it has to
  // survive a failure part-way through so a retry rebuilds the same chain
  // rather than a second one.
  const jobCardId = inspection.jobCardId?.trim()
    ? inspection.jobCardId.trim()
    : await claimInspectionJobCard(inspection.id, 'JC-' + Date.now());

  let createdJobCard = false;
  const existingJob = await fetchJobCardById(jobCardId);
  if (!existingJob) {
    await createJobCard({
      id:           jobCardId,
      customer:     inspection.customerName,
      vehicle:      inspection.vehicle,
      serviceType,
      channel:      'Shop bay',
      location:     '',
      technicians:  inspection.technician ? [inspection.technician] : [],
      priority:     'Normal',
      approvalCode: '',
      notes:        findings,
      // Nothing has been quoted. The service-type defaults would otherwise
      // put hours and a parts total on a job nobody has priced.
      laborHours:   0,
      partsTotal:   0,
    });
    createdJobCard = true;
  }

  const followOn = await createJobCardFollowOns({
    jobCardId,
    customerName: inspection.customerName,
    customerId:   inspection.customerId,
    vehicle:      inspection.vehicle,
    serviceType,
    notes:        inspection.notes,
    findings,
  });

  // Last, and only now. An inspection shown as Complete with no job behind it
  // is the state this whole thing exists to prevent — if the records above
  // threw, the status stays as it was and the technician can press again.
  await updateInspection(inspection.id, {
    status: 'Completed',
    completedAt: inspection.completedAt ?? new Date().toISOString(),
    jobCardId,
  });

  return {
    jobCardId,
    roNumber:         followOn.roNumber,
    quotationCreated: followOn.quotationCreated,
    createdJobCard,
    roReused:         followOn.roReused,
    quotationReused:  followOn.quotationReused,
    alreadyComplete:  !createdJobCard && followOn.roReused && followOn.quotationReused,
    errors:           followOn.errors,
  };
}
