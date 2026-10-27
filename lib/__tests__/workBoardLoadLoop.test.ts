/**
 * The Employees Work Board must load once, not forever.
 *
 * Reported from production: the Work Board tab flashed "Loading work board…"
 * and never showed. The roster (`techs`) was a fresh filtered array on every
 * render, and the effect that loads the board listed it as a dependency, so
 * every load's own state change re-rendered, re-ran the effect and started
 * another load.
 *
 * These checks read the component's source, as the other screen-wiring tests
 * here do: the roster is memoized, and the board effect is keyed on a string
 * of active technician names rather than on an array.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../../features/technicians/TechniciansView.tsx'), 'utf8');

describe('Employees Work Board loading', () => {
  it('memoizes the scoped roster so it keeps its identity between renders', () => {
    expect(src).toMatch(/const techs = useMemo\(\s*\(\) => allTechs\.filter\(/);
  });

  it('keys the board load on the active technician names, not on an array', () => {
    expect(src).toMatch(/const activeTechKey = useMemo\(/);
    expect(src).toMatch(/\}, \[tab, activeTechKey, loadBoard\]\);/);
    // The dependency that caused the endless reload.
    expect(src).not.toMatch(/\[tab, techs, loadBoard\]/);
  });

  it('drops a board response that a newer load has overtaken', () => {
    expect(src).toMatch(/if \(req !== boardRequest\.current\) return;/);
  });

  it('does not stay on "Loading" when there are no active technicians', () => {
    expect(src).toMatch(/if \(names\.length === 0\) \{ setBoardPerf\(\{\}\); setBoardLoading\(false\); return; \}/);
  });
});
