/**
 * Parts quotation rows need a visible, gap-free number for workshop staff.
 *
 * The number is deliberately derived from the rendered array index. It is not
 * business data and must never be persisted: deleting row 2 should make the
 * former row 3 become row 2 immediately, without a migration or save cycle.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(
  join(process.cwd(), 'features/parts/PartsEstimatesView.tsx'),
  'utf8',
);

describe('parts quotation line numbers', () => {
  it('shows a numbered column in the quotation editor', () => {
    expect(SRC).toContain('>No.</th>');
    expect(SRC).toContain('aria-label={`Part number ${idx + 1}`}');
    expect(SRC).toMatch(/form\.lineItems\.map\(\(item, idx\) =>[\s\S]*?\{idx \+ 1\}/);
  });

  it('shows the same position in the saved quotation detail view', () => {
    expect(SRC).toContain('>#{idx + 1}</span>');
  });

  it('does not persist a display-only line number', () => {
    expect(SRC).not.toMatch(/line(Number|_number)\s*:/);
  });
});
