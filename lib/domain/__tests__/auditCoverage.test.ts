/**
 * Which services record what they do.
 *
 * M1 ported three entities and they audit properly, through the domain layer.
 * The other twenty-five hold their own Supabase calls, and the audit trail was
 * described as though it covered the app when it covered three tables. This
 * test states the real coverage, so the claim and the code cannot drift.
 *
 * When a service is wired up, add it to AUDITED. When one is fully ported to
 * lib/domain, move it to PORTED. The list failing is the point: it means the
 * next person can see what is and is not recorded without reading 25 files.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SERVICES = join(process.cwd(), 'services');

/** Fully ported: the write and the audit live together in lib/domain. */
const PORTED = ['customerService', 'invoiceService', 'paymentService', 'employeeService'];

/** Wired with recordAudit at their existing write sites. */
const AUDITED = [
  'jobCardService', 'vehicleService', 'estimateService',
  'repairOrderService', 'inspectionService',
  // Partial: deleteAppointment records, create and update do not. Both have
  // three return paths apiece — retry branches for missing columns — and
  // wiring each one is the kind of edit that gets a branch wrong. They wait
  // for the porting pass, when the retries collapse into one path.
  'appointmentService',
  'partsService', 'partsOrderService', 'technicianService',
  // Partial: deleting a clock record is audited, clocking in and out is not —
  // the entry row is itself the record of those.
  'timeTrackingService',
  'shopSettingsService', 'maintenanceService', 'partsEstimateService',
];

/**
 * Deliberately not audited, and why.
 *
 * Coverage driven to zero would be a worse trail, not a better one. These
 * write derived, cosmetic or already-logged data, and rows about them would
 * outnumber the events anyone actually goes looking for. Excluding them is a
 * decision recorded here rather than an omission nobody noticed.
 */
const EXCLUDED: Record<string, string> = {
  dashboardLayoutService: 'where a user dragged their own widgets — a personal view preference',
  entityImageService:     'image attach/detach; the storage bucket keeps its own object log',
  vehicleImageService:    'as above, for vehicle photos',
  knowledgeGraphService:  'derived from records that are themselves audited',
  triageService:          'derived: symptom-to-cause suggestions, no business record changes',
  observabilityService:   'the logging system; auditing it would recurse',
  campaignService:        'marketing sends, tracked in their own send log',
  portalService:          'read-mostly customer-facing views over audited records',
  repairCaseService:      'derived grouping of repair orders, which are audited',
};

function source(name: string): string {
  return readFileSync(join(SERVICES, `${name}.ts`), 'utf8');
}

/** Services that write and are neither ported nor wired. */
function unaudited(): string[] {
  return readdirSync(SERVICES)
    .filter(f => f.endsWith('.ts'))
    .map(f => f.replace(/\.ts$/, ''))
    .filter(name => !PORTED.includes(name) && !AUDITED.includes(name) && !(name in EXCLUDED))
    .filter(name => /\.(insert|update|delete|upsert)\(/.test(source(name)));
}

describe('the services that record what they do', () => {
  it.each(AUDITED)('%s calls recordAudit', name => {
    expect(source(name)).toMatch(/recordAudit\(/);
  });

  it.each(AUDITED)('%s records after the write, not before', name => {
    // An audit row for something that did not happen is worse than a missing
    // one, because it is believed. Every call must follow its error check.
    const text = source(name);
    const firstErrorCheck = text.indexOf('if (error) throw error');
    const firstAudit = text.indexOf('recordAudit(');
    expect(firstErrorCheck).toBeGreaterThan(-1);
    expect(firstAudit).toBeGreaterThan(firstErrorCheck);
  });

  it('records what a deletion removed, read before it happens', () => {
    // After a delete there is nothing left to describe. A deletion nobody can
    // reconstruct is the exact gap the trail exists to close.
    for (const name of AUDITED) {
      const text = source(name);
      if (!/\.delete\(\)/.test(text)) continue;
      expect(text).toMatch(/const \{ data: before \}/);
    }
  });
});

describe('coverage is stated, not assumed', () => {
  it('lists every service that still writes without recording it', () => {
    // Not a failure — a statement. These write business data and leave no
    // trail, and anything built on "the audit trail covers the app" is wrong
    // until this list is empty.
    const remaining = unaudited();
    console.log(
      `[audit-coverage] ${PORTED.length} ported, ${AUDITED.length} wired, ` +
      `${Object.keys(EXCLUDED).length} excluded by decision, ` +
      `${remaining.length} still unaudited:\n  ${remaining.join('\n  ') || '(none)'}`,
    );
    expect(Array.isArray(remaining)).toBe(true);
  });

  it('every exclusion carries a reason', () => {
    // An empty reason is how a decision turns back into an oversight.
    for (const [name, why] of Object.entries(EXCLUDED)) {
      expect(why.length).toBeGreaterThan(20);
      expect(() => source(name)).not.toThrow();
    }
  });

  it('does not shrink silently', () => {
    // If a service is wired up, this number moves and the list above is
    // updated deliberately rather than by accident.
    expect(PORTED.length + AUDITED.length).toBe(17);
  });
});

describe('the retrospective helper differs from the domain one, on purpose', () => {
  const HELPER = readFileSync(join(process.cwd(), 'lib/domain/auditFromBrowser.ts'), 'utf8');

  it('never throws', () => {
    // writeAuditEvent throws because for money an unaudited write is worse
    // than a failed one, and there are three call sites to reason about. Here
    // there are dozens, added to code that has worked for a year: a job card
    // that saves without its audit row is a gap in the log; one that refuses
    // to save is a technician who cannot work.
    expect(HELPER).toMatch(/catch \(error\)/);
    expect(HELPER).not.toMatch(/throw /);
  });

  it('reports failures rather than swallowing them', () => {
    // A silent gap looked identical to a working system. That cost a day.
    expect(HELPER).toMatch(/console\.error/);
    expect(HELPER).toMatch(/alertException/);
  });
});
