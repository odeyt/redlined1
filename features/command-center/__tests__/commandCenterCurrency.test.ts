/**
 * The Command Center must format money only through the shared formatter, in
 * the shop's currency. It used to print a literal "฿0" for an empty revenue
 * card, and prefix "$" by hand elsewhere, so a USD shop could read as a baht
 * account and a baht shop as a dollar one.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe.each(['CommandCenterView.tsx', 'MorningBriefModal.tsx'])('%s', file => {
  const src = read(file);

  it('contains no hard-coded baht sign', () => {
    expect(src).not.toContain('฿');
  });

  it('builds no currency string by hand from a "$" prefix', () => {
    expect(src).not.toMatch(/`\$\$\{/);
    expect(src).not.toMatch(/['"]\$['"]\s*\+/);
  });

  it('formats through the shared lib/currencies formatter', () => {
    expect(src).toMatch(/from '@\/lib\/currencies'/);
    expect(src).toMatch(/formatMoney\(/);
  });
});

it('Command Center reads the shop currency from settings rather than assuming one', () => {
  const src = read('CommandCenterView.tsx');
  expect(src).toMatch(/fetchShopSettings\(\)/);
  expect(src).toMatch(/setCurrency\(s\.defaultCurrency\)/);
});
