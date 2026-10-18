/**
 * Vehicle profiles store `health_score` only. The Command Center's health
 * summary selected a `health_status` column that does not exist, so its query
 * failed and the route reported "0 profiled" — production has dozens. The band
 * is derived from the score in one place, and nothing may select the column.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { healthStatusFromScore, calculateVehicleHealth } from '@/intelligence/vehicle/VehicleIntelligenceEngine';

describe('healthStatusFromScore', () => {
  it.each([
    [100, 'healthy'], [80, 'healthy'], [79, 'monitor'], [60, 'monitor'],
    [59, 'attention'], [40, 'attention'], [39, 'high_risk'], [0, 'high_risk'],
  ])('%i -> %s', (score, band) => {
    expect(healthStatusFromScore(score)).toBe(band);
  });

  it('is the band calculateVehicleHealth reports', () => {
    const { score, status } = calculateVehicleHealth({
      comebackCount: 2, concerns: [], dtcs: [], declinedWork: [], unpaidInvoiceCount: 1,
      hasCompleteHistory: false, openEstimateCount: 2, repairLessons: [], completedJobCount: 0,
    } as unknown as Parameters<typeof calculateVehicleHealth>[0]);
    expect(status).toBe(healthStatusFromScore(score));
  });
});

describe('vehicle_intelligence_profiles reads', () => {
  const root = join(__dirname, '..', '..', '..');
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' || n === '__tests__' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

  it('never select the non-existent health_status column', () => {
    const offenders = ['app', 'intelligence', 'services', 'features', 'lib']
      .flatMap(d => walk(join(root, d)))
      .filter(f => /select\([^)]*health_status/.test(readFileSync(f, 'utf8')))
      .map(f => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
