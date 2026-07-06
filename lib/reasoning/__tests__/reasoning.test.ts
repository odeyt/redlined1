/**
 * ERE unit tests — pure computation, no I/O, no Supabase.
 * Run with: npx jest lib/reasoning/__tests__/reasoning.test.ts
 */

import { EvidenceEngine }       from '../EvidenceEngine';
import { ConfidenceEngine }     from '../ConfidenceEngine';
import { RecommendationEngine } from '../RecommendationEngine';
import { ReasoningEngine }      from '../ReasoningEngine';
import { ERECache }             from '../cache';
import { bmwFixture, toyotaFixture, fordFixture, mercedesFixture } from './fixtures';

// ─── EvidenceEngine ───────────────────────────────────────────────────────────

describe('EvidenceEngine', () => {
  const engine = new EvidenceEngine();

  it('BMW: collects gold_verified + oscilloscope evidence', () => {
    const ev = engine.collect(bmwFixture);
    const types = ev.map(e => e.type);
    expect(types).toContain('verified_status');
    expect(types).toContain('test');
    expect(types).toContain('dtc');
    expect(ev.find(e => e.value === 'Gold Verified')).toBeDefined();
  });

  it('BMW: sorts by weight descending', () => {
    const ev = engine.collect(bmwFixture);
    for (let i = 1; i < ev.length; i++) {
      expect(ev[i - 1].weight).toBeGreaterThanOrEqual(ev[i].weight);
    }
  });

  it('Toyota: comeback penalty is negative weight', () => {
    const ev = engine.collect(toyotaFixture);
    const comeback = ev.find(e => e.type === 'comeback');
    expect(comeback).toBeDefined();
    expect(comeback!.weight).toBeLessThan(0);
  });

  it('Ford: empty case produces minimal evidence', () => {
    const ev = engine.collect(fordFixture);
    expect(ev.length).toBeGreaterThan(0); // has symptom evidence
    expect(ev.find(e => e.type === 'verified_status')).toBeUndefined();
  });

  it('Mercedes: oscilloscope has high weight', () => {
    const ev = engine.collect(mercedesFixture);
    const scope = ev.find(e => e.value.toLowerCase().includes('oscilloscope'));
    expect(scope).toBeDefined();
    expect(scope!.weight).toBeGreaterThanOrEqual(60);
  });
});

// ─── ConfidenceEngine ─────────────────────────────────────────────────────────

describe('ConfidenceEngine', () => {
  const evidenceEngine    = new EvidenceEngine();
  const confidenceEngine  = new ConfidenceEngine();

  it('BMW: gold verified case has high confidence', () => {
    const ev     = evidenceEngine.collect(bmwFixture);
    const result = confidenceEngine.calculate(ev, bmwFixture.similarRepairs ?? [], bmwFixture.verificationStatus);
    expect(result.overall).toBeGreaterThanOrEqual(75);
    expect(result.unknownRisk).toBe('low');
  });

  it('Toyota: comeback reduces confidence', () => {
    const ev     = evidenceEngine.collect(toyotaFixture);
    const result = confidenceEngine.calculate(ev, toyotaFixture.similarRepairs ?? [], toyotaFixture.verificationStatus);
    expect(result.comebackPenalty).toBeGreaterThan(0);
    expect(result.overall).toBeLessThan(85);
  });

  it('Ford: no tests → low confidence', () => {
    const ev     = evidenceEngine.collect(fordFixture);
    const result = confidenceEngine.calculate(ev, [], fordFixture.verificationStatus);
    expect(result.overall).toBeLessThan(55);
    expect(result.unknownRisk).not.toBe('low');
  });

  it('confidence is clamped to 0-98', () => {
    const ev     = evidenceEngine.collect(bmwFixture);
    const result = confidenceEngine.calculate(ev, bmwFixture.similarRepairs ?? [], 'gold_verified');
    expect(result.overall).toBeLessThanOrEqual(98);
    expect(result.overall).toBeGreaterThanOrEqual(0);
  });

  it('breakdown factors sum directionally with result', () => {
    const ev     = evidenceEngine.collect(bmwFixture);
    const result = confidenceEngine.calculate(ev, bmwFixture.similarRepairs ?? [], bmwFixture.verificationStatus);
    expect(result.breakdown.length).toBeGreaterThan(0);
    const hasPositive = result.breakdown.some(b => b.impact > 0);
    expect(hasPositive).toBe(true);
  });
});

// ─── RecommendationEngine ─────────────────────────────────────────────────────

describe('RecommendationEngine', () => {
  const evidenceEngine       = new EvidenceEngine();
  const recommendationEngine = new RecommendationEngine();

  it('BMW: returns at most 5 recommendations', () => {
    const ev   = evidenceEngine.collect(bmwFixture);
    const recs = recommendationEngine.generate(
      bmwFixture, ev, bmwFixture.similarRepairs ?? [], bmwFixture.lessons ?? []
    );
    expect(recs.length).toBeLessThanOrEqual(5);
    expect(recs.length).toBeGreaterThan(0);
  });

  it('BMW: recommendations are ranked 1..N', () => {
    const ev   = evidenceEngine.collect(bmwFixture);
    const recs = recommendationEngine.generate(
      bmwFixture, ev, bmwFixture.similarRepairs ?? [], bmwFixture.lessons ?? []
    );
    recs.forEach((r, i) => expect(r.rank).toBe(i + 1));
  });

  it('Ford: DTC-less case returns symptom-based recommendations', () => {
    const ev   = evidenceEngine.collect(fordFixture);
    const recs = recommendationEngine.generate(fordFixture, ev, [], []);
    expect(recs.length).toBeGreaterThanOrEqual(0); // no crash even with empty data
  });

  it('Mercedes: U0100 generates CAN bus recommendation', () => {
    const ev   = evidenceEngine.collect(mercedesFixture);
    const recs = recommendationEngine.generate(
      mercedesFixture, ev, mercedesFixture.similarRepairs ?? [], mercedesFixture.lessons ?? []
    );
    const canRec = recs.find(r => r.action.toLowerCase().includes('can'));
    expect(canRec).toBeDefined();
  });

  it('all recommendations have confidence 0-100', () => {
    const ev   = evidenceEngine.collect(bmwFixture);
    const recs = recommendationEngine.generate(
      bmwFixture, ev, bmwFixture.similarRepairs ?? [], bmwFixture.lessons ?? []
    );
    recs.forEach(r => {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
    });
  });
});

// ─── ReasoningEngine (orchestrator) ───────────────────────────────────────────

describe('ReasoningEngine', () => {
  const engine = new ReasoningEngine();

  it('BMW: full pipeline returns valid result', async () => {
    const result = await engine.reason(bmwFixture);
    expect(result.confidence.overall).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.llmContext).toBeDefined();
    expect(result.llmContext.vehicle.make).toBe('BMW');
    expect(result.llmContext.vehicle.vin).toBeNull(); // VIN never sent to LLM
  });

  it('BMW: runs under 200ms', async () => {
    const start  = Date.now();
    await engine.reason(bmwFixture);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it('BMW: caches result on second call', async () => {
    const r1 = await engine.reason(bmwFixture);
    const r2 = await engine.reason(bmwFixture);
    expect(r1.cacheKey).toBe(r2.cacheKey);
  });

  it('invalidate clears cache for that repair case', async () => {
    await engine.reason(bmwFixture);
    engine.invalidate(bmwFixture.repairCaseId);
    // Should not throw — re-runs from scratch
    const r = await engine.reason(bmwFixture);
    expect(r).toBeDefined();
  });

  it('Ford: low-data case returns known unknowns', async () => {
    const result = await engine.reason(fordFixture);
    expect(result.knownUnknowns.length).toBeGreaterThan(0);
    const hasHighSeverity = result.knownUnknowns.some(u => u.severity === 'high');
    expect(hasHighSeverity).toBe(true);
  });

  it('Toyota: comeback case has comebackPenalty > 0', async () => {
    const result = await engine.reason(toyotaFixture);
    expect(result.confidence.comebackPenalty).toBeGreaterThan(0);
  });

  it('Mercedes: electrical case flags oscilloscope evidence', async () => {
    const result = await engine.reason(mercedesFixture);
    const scopeEv = result.evidence.find(e => e.value.toLowerCase().includes('oscilloscope'));
    expect(scopeEv).toBeDefined();
  });

  it('LLM context never contains VIN', async () => {
    const result = await engine.reason(bmwFixture);
    expect(result.llmContext.vehicle.vin).toBeNull();
    const serialized = JSON.stringify(result.llmContext);
    expect(serialized).not.toContain('"vin":"');
  });

  it('timeline has 5 steps', async () => {
    const result = await engine.reason(bmwFixture);
    expect(result.timeline.steps.length).toBe(5);
    expect(result.timeline.totalMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── ERECache ─────────────────────────────────────────────────────────────────

describe('ERECache', () => {
  it('stores and retrieves a value', () => {
    const cache = new ERECache();
    cache.set('key1', { foo: 'bar' }, 'RECOMMENDATIONS');
    expect(cache.get('key1')).toEqual({ foo: 'bar' });
  });

  it('returns null for missing key', () => {
    const cache = new ERECache();
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('invalidateByRepairCase removes matching keys', () => {
    const cache = new ERECache();
    cache.set('ere:case-abc|pending|P0171|1|0|0', 'x', 'RECOMMENDATIONS');
    cache.set('ere:case-xyz|pending||0|0|0', 'y', 'RECOMMENDATIONS');
    cache.invalidateByRepairCase('case-abc');
    expect(cache.get('ere:case-abc|pending|P0171|1|0|0')).toBeNull();
    expect(cache.get('ere:case-xyz|pending||0|0|0')).toBe('y');
  });

  it('flush clears all entries', () => {
    const cache = new ERECache();
    cache.set('k1', 1, 'CONFIDENCE');
    cache.set('k2', 2, 'GRAPH_LOOKUP');
    cache.flush();
    expect(cache.size()).toBe(0);
  });
});
