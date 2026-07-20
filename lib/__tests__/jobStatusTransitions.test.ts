import { isValidTransition, predecessorOf, isAfter, REPAIR_STAGE_ORDER } from '../jobStatusTransitions';

describe('REPAIR_STAGE_ORDER', () => {
  it('matches the 6-value stage vocabulary already used by job_cards.repair_stage, the web UI, and the mobile app', () => {
    expect(REPAIR_STAGE_ORDER).toEqual(['checked_in', 'inspecting', 'waiting_parts', 'in_repair', 'quality_check', 'ready']);
  });
});

describe('isValidTransition', () => {
  it('allows each single forward step in the ordered chain', () => {
    expect(isValidTransition('checked_in', 'inspecting')).toBe(true);
    expect(isValidTransition('inspecting', 'waiting_parts')).toBe(true);
    expect(isValidTransition('waiting_parts', 'in_repair')).toBe(true);
    expect(isValidTransition('in_repair', 'quality_check')).toBe(true);
    expect(isValidTransition('quality_check', 'ready')).toBe(true);
  });

  it('rejects skipping ahead more than one stage', () => {
    expect(isValidTransition('checked_in', 'waiting_parts')).toBe(false);
    expect(isValidTransition('checked_in', 'ready')).toBe(false);
  });

  it('rejects moving backward', () => {
    expect(isValidTransition('inspecting', 'checked_in')).toBe(false);
    expect(isValidTransition('ready', 'in_repair')).toBe(false);
  });

  it('rejects a transition off the terminal stage entirely', () => {
    expect(isValidTransition('ready', 'checked_in')).toBe(false);
    expect(isValidTransition('ready', 'inspecting')).toBe(false);
  });

  it('rejects a same-stage transition (not a new transition at all)', () => {
    expect(isValidTransition('inspecting', 'inspecting')).toBe(false);
  });

  it('rejects unknown stage strings on either side', () => {
    expect(isValidTransition('checked_in', 'not_a_real_stage')).toBe(false);
    expect(isValidTransition('not_a_real_stage', 'inspecting')).toBe(false);
  });
});

describe('predecessorOf', () => {
  it('returns the single legal prior stage for each stage after the first', () => {
    expect(predecessorOf('inspecting')).toBe('checked_in');
    expect(predecessorOf('ready')).toBe('quality_check');
  });

  it('returns undefined for the first stage (no predecessor) and for unknown stages', () => {
    expect(predecessorOf('checked_in')).toBeUndefined();
    expect(predecessorOf('not_a_real_stage')).toBeUndefined();
  });
});

describe('isAfter', () => {
  it('is true when the first stage is further along than the second', () => {
    expect(isAfter('ready', 'checked_in')).toBe(true);
    expect(isAfter('in_repair', 'inspecting')).toBe(true);
  });

  it('is false when equal or earlier', () => {
    expect(isAfter('inspecting', 'inspecting')).toBe(false);
    expect(isAfter('checked_in', 'ready')).toBe(false);
  });

  it('is false for unknown stage strings', () => {
    expect(isAfter('not_a_real_stage', 'checked_in')).toBe(false);
  });
});
