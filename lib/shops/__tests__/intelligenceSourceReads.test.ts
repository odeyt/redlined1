/**
 * Every read of a SOURCE business table in the intelligence engines goes
 * through mergedShopScope(), so a location merged into the active shop (D1
 * Imports into Location 2) is part of its recommendations, signals, metrics,
 * memory and customer/vehicle intelligence.
 *
 * Derived tables the engines write — recommendations, signals, metrics,
 * profiles, briefs, memory — are deliberately NOT listed: they stay keyed by
 * the active shop and are recomputed from the widened source data.
 *
 * A new `.eq('shop_id', …)` on one of these tables brings back the bug where
 * a merged location's history silently dropped out of the Command Center.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..', '..', 'intelligence');
const SOURCE_TABLES = [
  'job_cards', 'closed_jobs', 'estimates', 'estimate_lines', 'estimate_declined_items',
  'repair_orders', 'repair_cases', 'invoices', 'payments', 'customers', 'vehicles',
  'appointments', 'inspections', 'inspection_findings', 'dtc_records', 'parts', 'parts_order_items',
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

/** `file:line table` for every single-shop read of a source table. */
function singleShopSourceReads(): string[] {
  const hits: string[] = [];
  for (const f of files(ROOT)) {
    const lines = readFileSync(f, 'utf8').split(/\r?\n/);
    let table = '';
    let at = -100;
    lines.forEach((line, i) => {
      const from = line.match(/\.from\(['"]([a-z_]+)['"]\)/);
      if (from) { table = from[1]; at = i; }
      if (/\.eq\(\s*['"]shop_id['"]/.test(line) && i - at < 12 && SOURCE_TABLES.includes(table)) {
        hits.push(`${relative(ROOT, f)}:${i + 1} ${table}`);
      }
    });
  }
  return hits;
}

describe('intelligence source reads', () => {
  it('never read a source table for the active shop alone', () => {
    expect(singleShopSourceReads()).toEqual([]);
  });

  it('read them through mergedShopScope', () => {
    const engines = files(ROOT).filter(f => /mergedShopScope\(/.test(readFileSync(f, 'utf8')));
    expect(engines.map(f => relative(ROOT, f).replace(/\\/g, '/')).sort()).toEqual([
      'customer/CustomerContextBuilder.ts',
      'memory/BusinessMemoryEngine.ts',
      'metrics/MetricsBuilder.ts',
      'service-advisor/AdvisorContextBuilder.ts',
      'service-advisor/EstimateFollowUpEngine.ts',
      'signals/SignalExtractor.ts',
      'vehicle/VehicleIntelligenceEngine.ts',
    ]);
  });
});
