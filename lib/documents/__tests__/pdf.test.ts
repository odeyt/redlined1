/**
 * The PDF layout moved out of the email route (API v1 phase 5).
 *
 * The move was verified byte-for-byte against the previous route on
 * 2026-11-25 (4 documents; only pdf-lib's creation timestamps differ). These
 * tests keep it that way: the email route uses this module and nothing else,
 * and the draft stamp adds nothing unless it is asked for.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { inflateSync } from 'zlib';
import { buildPdf } from '../pdf';

/** pdf-lib stamps the time it ran; everything else must match. */
const stable = (b: Uint8Array) => Buffer.from(b).toString('latin1')
  .replace(/\/CreationDate \(D:[^)]*\)/g, '').replace(/\/ModDate \(D:[^)]*\)/g, '');

/** Every content stream, inflated, so drawn text can be searched. */
function pageText(b: Uint8Array): string {
  const raw = Buffer.from(b);
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const s = raw.indexOf('stream', at);
    if (s < 0) break;
    const start = raw[s + 6] === 0x0d ? s + 8 : s + 7;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    try { out.push(inflateSync(raw.subarray(start, end)).toString('latin1')); } catch { /* not flate */ }
    at = end + 9;
  }
  return out.join('\n');
}
const hex = (s: string) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();

const doc = {
  type: 'estimate' as const, number: 'EST-0042', customerName: 'Somchai', vehicle: 'Hilux', date: '11/25/2026',
  lines: [{ description: 'Pads', qty: 2, rate: 100, currency: 'USD' }],
  subtotal: 200, discount: 0, tax: 0, total: 200, currency: 'USD', notes: '',
  shopName: 'D1 Imports', shopAddress: 'Vientiane', shopPhone: '020', shopEmail: '',
  isWatermarked: false,
};

describe('the email route renders through this module', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/send-document/route.ts'), 'utf8');

  it('imports buildPdf from lib/documents/pdf', () => {
    expect(route).toMatch(/import \{ buildPdf, money \} from '@\/lib\/documents\/pdf'/);
  });

  it('no longer has its own copy', () => {
    expect(route).not.toMatch(/function buildPdf/);
    expect(route).not.toMatch(/from 'pdf-lib'/);
  });

  it('never asks for the draft stamp', () => {
    expect(route).not.toMatch(/draftWatermark/);
  });
});

describe('the draft stamp', () => {
  it('changes nothing when false or absent', async () => {
    expect(stable(await buildPdf({ ...doc, draftWatermark: false }))).toBe(stable(await buildPdf(doc)));
  });

  it('draws DRAFT and the not-issued line when asked', async () => {
    const text = pageText(await buildPdf({ ...doc, draftWatermark: true }));
    expect(text).toContain(hex('DRAFT'));
    expect(text).toContain(hex('DRAFT: not issued. Not valid for payment.'));
    expect(pageText(await buildPdf(doc))).not.toContain(hex('DRAFT: not issued'));
  });

  it('is a real PDF either way', async () => {
    expect(Buffer.from(await buildPdf({ ...doc, draftWatermark: true })).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
