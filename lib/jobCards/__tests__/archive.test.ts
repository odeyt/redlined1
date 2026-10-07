import { mergeArchive } from '../archive';

const row = (id: string, closed: string | null, extra: Record<string, unknown> = {}) => ({ id, closed_date: closed, ...extra });

describe('mergeArchive', () => {
  it('includes jobs closed into closed_jobs, which the archive used to miss', () => {
    const out = mergeArchive([], [row('JC-1', '2026-09-10T08:00:00Z')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'JC-1', source: 'closed' });
  });

  it('keeps finished job cards still in job_cards', () => {
    const out = mergeArchive([row('JC-2', '2026-09-11T08:00:00Z')], []);
    expect(out[0]).toMatchObject({ id: 'JC-2', source: 'open' });
  });

  it('lists a job in both tables once, as the archived copy', () => {
    const out = mergeArchive(
      [row('JC-3', '2026-09-01T08:00:00Z', { status: 'Complete' })],
      [row('JC-3', '2026-09-02T08:00:00Z', { status: 'Closed' })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: 'closed', status: 'Closed' });
  });

  it('sorts newest closed first, undated last', () => {
    const out = mergeArchive(
      [row('A', '2026-09-01T00:00:00Z'), row('U', null)],
      [row('B', '2026-09-20T00:00:00Z'), row('C', '2026-09-10T00:00:00Z')],
    );
    expect(out.map(r => r.id)).toEqual(['B', 'C', 'A', 'U']);
  });

  it('does not mutate its inputs', () => {
    const open = [row('A', null)];
    const copy = JSON.parse(JSON.stringify(open));
    mergeArchive(open, []);
    expect(open).toEqual(copy);
  });

  it('is empty for no rows', () => {
    expect(mergeArchive([], [])).toEqual([]);
  });
});
