/**
 * The production function bodies OWNER START and OWNER FINISH pin.
 *
 * The measured values below are copied from the owner's 2026-09-16 run of
 * scripts/security/sql/alert-definition-drift.sql (rows 10-15), independently
 * of productionDefinitions.ts, so a wrong body cannot agree with itself.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  EXPECTED_ALERTS, PINNED_FUNCTIONS, RO_WALKTHROUGH_TRANSITIONS, expectedAlertsFor, functionBody,
  normalizedProsrcMd5, prosrcMd5, roAlertModelFromSource,
} from '../alertExpectation';
import { PRODUCTION_DEFINITIONS, PRODUCTION_MEASURED_ON, productionDefinition } from '../productionDefinitions';

const root = join(__dirname, '..', '..', '..');
const repoBody = (name: string) => {
  const fn = PINNED_FUNCTIONS.find(f => f.name === name)!;
  const body = functionBody(readFileSync(join(root, fn.file), 'utf8'), name);
  if (body === null) throw new Error(`no repository body for ${name}`);
  return body;
};

/** Drift audit rows 10-15: md5(prosrc), line count, and the verdict against the repository. */
const MEASURED: Record<string, { md5: string; lines: number; verdict: 'DIFFERS' | 'WHITESPACE' }> = {
  alert_ro_status_changed: { md5: 'a2191579b54da621f31440a414a3985b', lines: 13, verdict: 'DIFFERS' },
  alert_ro_pending_approval: { md5: '1ab02bf494eb4a26b0e30d94986687df', lines: 11, verdict: 'WHITESPACE' },
  emit_alert_event: { md5: 'de591ac4c49b3955d6ab6484e961e319', lines: 6, verdict: 'WHITESPACE' },
  record_ro_status_change: { md5: '29006f00617e1bbf1240c7cfa2a0d632', lines: 11, verdict: 'WHITESPACE' },
  alert_job_assigned: { md5: '701f06455314080c5864e3d429cde448', lines: 40, verdict: 'DIFFERS' },
  alert_job_work_added: { md5: '0e105ae3cd75ed3da504bb5ac3939c5f', lines: 54, verdict: 'DIFFERS' },
};

/**
 * SQL tokens, left to right, with line comments dropped. One pass decides
 * comment versus string by whichever starts first, so an apostrophe inside a
 * comment or "--" inside a string is handled. String literals stay whole, so
 * spacing inside them still counts. Block comments, dollar quotes and E''
 * strings are not handled, and are asserted absent.
 */
const tokens = (src: string) =>
  (src.match(/--[^\r\n]*|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|::|<>|\|\||:=|\S/g) ?? [])
    .filter(t => !t.startsWith('--'));
const lexable = (src: string) => !/\/\*|\$|\bE'/.test(src);

describe('production definitions', () => {
  it(`were measured on the date the drift audit ran`, () => {
    expect(PRODUCTION_MEASURED_ON).toBe('2026-09-16');
  });

  it('pin the same six functions, in the same order, as PINNED_FUNCTIONS', () => {
    expect(PRODUCTION_DEFINITIONS.map(d => d.name)).toEqual(PINNED_FUNCTIONS.map(f => f.name));
    expect(Object.keys(MEASURED).sort()).toEqual(PRODUCTION_DEFINITIONS.map(d => d.name).sort());
  });

  describe.each(PRODUCTION_DEFINITIONS.map(d => [d.name, d] as const))('%s', (name, d) => {
    it('hashes to the md5 and line count production reported', () => {
      expect(prosrcMd5(d.prosrc)).toBe(MEASURED[name].md5);
      expect(d.exactMd5).toBe(MEASURED[name].md5);
      expect(d.prosrc.split('\n')).toHaveLength(MEASURED[name].lines);
      expect(d.lineCount).toBe(MEASURED[name].lines);
      expect(d.normalizedMd5).toBe(normalizedProsrcMd5(d.prosrc));
    });

    it('uses CRLF throughout, as production stores it', () => {
      expect(d.prosrc).toContain('\r\n');
      expect(d.prosrc.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    });

    it('reproduces the drift audit verdict against the repository', () => {
      const repo = repoBody(name);
      expect(prosrcMd5(repo)).not.toBe(d.exactMd5);
      if (MEASURED[name].verdict === 'WHITESPACE') {
        expect(normalizedProsrcMd5(repo)).toBe(d.normalizedMd5);
      } else {
        expect(normalizedProsrcMd5(repo)).not.toBe(d.normalizedMd5);
      }
    });

    it('differs from the repository only in comments and whitespace', () => {
      const repo = repoBody(name);
      expect(lexable(repo) && lexable(d.prosrc)).toBe(true);
      expect(d.prosrc).not.toContain('--');
      const live = tokens(d.prosrc);
      expect(live.length).toBeGreaterThan(10);
      expect(live).toEqual(tokens(repo));
    });
  });

  it('the token comparison notices a one-token change', () => {
    const d = productionDefinition('alert_ro_status_changed');
    expect(tokens(d.prosrc.replace("<> 'Pending Approval'", "= 'Pending Approval'"))).not.toEqual(tokens(d.prosrc));
    expect(tokens(d.prosrc.replace("' → '", "'→'"))).not.toEqual(tokens(d.prosrc));
    expect(tokens("a -- it's a comment\r\nb 'x -- y'")).toEqual(['a', 'b', "'x -- y'"]);
  });

  it('raise exactly EXPECTED_ALERTS, the same as the repository source', () => {
    const live = roAlertModelFromSource(
      productionDefinition('alert_ro_status_changed').prosrc,
      productionDefinition('alert_ro_pending_approval').prosrc,
    );
    expect(live).not.toBeNull();
    expect(live).toEqual(roAlertModelFromSource(repoBody('alert_ro_status_changed'), repoBody('alert_ro_pending_approval')));
    expect(expectedAlertsFor(live!, RO_WALKTHROUGH_TRANSITIONS, 'RO-DEMO-330')).toEqual(EXPECTED_ALERTS);
  });

  it('refuses a function that is not pinned', () => {
    expect(() => productionDefinition('notify_push_on_alert')).toThrow('no production definition pinned');
  });
});
