/**
 * Marking an inspection complete starts the job — from every route to it.
 *
 * Two things regressed before this existed and would regress again silently.
 * The first is that "Mark Complete" only wrote a status: a technician who did
 * the work in the proper order — inspect, then quote — ended with a green
 * inspection and nothing to work from, while a colleague who pressed "Send to
 * Job Card" at the front desk got all three records. The second is the status
 * dropdown two rows above the button, which reaches Completed by a different
 * code path and produced the same empty result.
 *
 * These read source rather than rendering, matching intakeCreatesJobCard.test
 * next door. That buys less than a render test would, but it pins the parts
 * that actually break: that the hand-off is wired at all, that the status is
 * never written optimistically, and that every query involved stays inside
 * the shop.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const view       = read('features/inspections/InspectionsView.tsx');
const completion = read('services/inspectionCompletionService.ts');
const inspections = read('services/inspectionService.ts');
const jobCards    = read('services/jobCardService.ts');
const repairOrders = read('services/repairOrderService.ts');
const partsEstimates = read('services/partsEstimateService.ts');

describe('the Mark Complete button', () => {
  it('hands off to the completion service instead of writing a status', () => {
    expect(view).toMatch(/import \{ completeInspection.*\} from '@\/services\/inspectionCompletionService'/);
    expect(view).toMatch(/const result = await completeInspection\(ins\)/);
  });

  it('no longer flips the status by itself', () => {
    // The old body was a bare updateInspection to Completed. Anything that
    // reintroduces one here puts the inspection back out of step with the job.
    expect(view).not.toMatch(
      /async function handleComplete[\s\S]*?await updateInspection\(\s*ins\.id,\s*\{\s*status: 'Completed'/,
    );
  });

  it('says what it is doing and cannot be pressed twice while it works', () => {
    expect(view).toMatch(/if \(completing\) return;/);
    expect(view).toMatch(/disabled=\{completing\}/);
    expect(view).toMatch(/Creating job card/);
  });

  it('offers the way into the job it just created', () => {
    expect(view).toMatch(/function openJobCard\(/);
    expect(view).toMatch(/entityType: 'job_card'/);
    expect(view).toMatch(/module: 'job-cards'/);
  });

  it('keeps a failure honest rather than showing Completed anyway', () => {
    // An inspection reading Completed with no job behind it is the exact
    // state this feature exists to prevent, so the catch must not update the
    // list — and it has to say the retry is safe, because it is.
    const handler = view.slice(view.indexOf('async function handleComplete'));
    const body = handler.slice(0, handler.indexOf('\n  function openJobCard'));
    const failure = body.slice(body.indexOf('} catch'));
    expect(failure).not.toMatch(/setInspections|setSelected/);
    expect(failure).toMatch(/press Mark Complete again/);
  });

  it('reaches the same service when the status dropdown is used instead', () => {
    expect(view).toMatch(/const becameComplete = selected\?\.status !== 'Completed' && form\.status === 'Completed'/);
    expect(view).toMatch(/if \(becameComplete\) \{[\s\S]*?await handleComplete\(updated\)/);
  });
});

describe('what the completion raises', () => {
  it('creates the job card, the repair order and the parts quotation', () => {
    expect(completion).toMatch(/await createJobCard\(\{/);
    expect(completion).toMatch(/await createJobCardFollowOns\(\{/);
  });

  it('stamps the job card back onto the inspection', () => {
    expect(completion).toMatch(/await updateInspection\(inspection\.id, \{[\s\S]*?jobCardId,/);
  });

  it('writes the status only after the records exist', () => {
    expect(completion.indexOf('createJobCardFollowOns'))
      .toBeLessThan(completion.indexOf("status: 'Completed'"));
  });

  it('orders no parts and approves nothing', () => {
    expect(completion).not.toMatch(/createPartsOrder|orderParts|status: 'Ordered'|status: 'Approved'/);
    expect(completion).toMatch(/laborHours:\s+0/);
    expect(completion).toMatch(/partsTotal:\s+0/);
  });
});

describe('tenant isolation', () => {
  it('scopes the job card id claim to this shop on both the write and the read back', () => {
    const claim = inspections.slice(
      inspections.indexOf('export async function claimInspectionJobCard'),
      inspections.indexOf('export async function deleteInspection'),
    );
    // Three statements touch the row — the claim, the read back, and the
    // legacy empty-string claim. Every one of them has to be shop-scoped, or
    // a guessed id becomes a way to write to another shop's inspection.
    const touches = claim.match(/\.eq\('id', id\)/g) ?? [];
    const scoped  = claim.match(/\.in\('shop_id', getShopIds\(\)\)/g) ?? [];
    expect(touches.length).toBeGreaterThan(0);
    expect(scoped.length).toBeGreaterThanOrEqual(touches.length);
  });

  it('claims the id in one conditional update, not a read followed by a write', () => {
    // A read-then-write loses the race it exists to win. The guard is that
    // Postgres, not the client, decides who gets the null column.
    expect(inspections).toMatch(
      /\.update\(\{ job_card_id: candidateJobCardId \}\)[\s\S]{0,200}?\.is\('job_card_id', null\)/,
    );
  });

  it('scopes every new lookup to this shop', () => {
    for (const [name, src, fn] of [
      ['job card', jobCards, 'fetchJobCardById'],
      ['repair order', repairOrders, 'findRepairOrderByJobCard'],
      ['parts quotation', partsEstimates, 'findPartsEstimateByJobCard'],
    ] as const) {
      const body = src.slice(src.indexOf(`export async function ${fn}`));
      const upToNext = body.slice(0, body.indexOf('\nexport '));
      expect(`${name}: ${upToNext}`).toMatch(/\.in\('shop_id', getShopIds\(\)\)/);
    }
  });

  it('uses no service-role client anywhere in the completion path', () => {
    for (const src of [completion, view]) {
      expect(src).not.toMatch(/SERVICE_ROLE|serviceRole|createAdminClient/);
    }
  });
});
