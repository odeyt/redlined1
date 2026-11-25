/**
 * API v1 estimate/invoice shapes and query rules (PLAN.md phase 3).
 */
import { URL } from 'url';
import {
  ESTIMATE_STATUSES, INVOICE_STATUSES, apiStatus, parseDocumentListQuery, pageMeta,
  presentEstimate, presentInvoice, settlementFor, lineTotalsByCurrency, money,
} from '../documents';
import { ApiError } from '../errors';
import { calculateEstimateTotals } from '@/lib/domain/estimateMath';
import { getEffectiveTotal, mapInvoiceRow } from '@/lib/domain/invoiceMath';
import { mapEstimateRow } from '@/lib/domain/estimates';
import { receivablesFrom } from '@/lib/domain/receivables';
import { mapPaymentRow } from '@/lib/domain/payments';
import { provenanceOf } from '@/lib/domain/documentQuery';
import { API_SCOPES, capabilitiesForScopes } from '../scopes';

const q = (s: string, statuses = ESTIMATE_STATUSES) =>
  parseDocumentListQuery(new URL('https://x.test/api/v1/estimates' + s) as unknown as globalThis.URL, statuses);

function reason(fn: () => unknown): string {
  try { fn(); } catch (e) {
    if (e instanceof ApiError) return `${e.code}: ${(e.details as { reason: string }).reason}`;
    throw e;
  }
  return 'no error';
}

const estimateRow = {
  id: '11111111-1111-4111-8111-111111111111',
  shop_id: 'shop-a',
  estimate_number: 'EST-0042',
  customer_name: 'Somchai',
  customer_id: '22222222-2222-4222-8222-222222222222',
  vehicle: '2019 Toyota Hilux',
  status: 'Approved',
  currency: 'THB',
  discount: 100,
  tax_rate: 0.07,
  notes: 'Brake job',
  valid_until: '2026-12-31',
  approved_date: '2026-11-20T10:00:00Z',
  created_at: '2026-11-19T09:00:00Z',
  lines: [
    { description: 'Brake pads', note: '', qty: 2, rate: 1250.5, cost: 600, markup: 0.4, currency: 'THB',
      partsSource: { supplier: 'secret-supplier' } },
    { description: 'Labour', laoDescription: 'ຄ່າແຮງ', note: '1h', qty: 1, rate: 800 },
    { description: 'Imported sensor', note: '', qty: 1, rate: 45, cost: 30, currency: 'USD' },
  ],
};

describe('query parsing', () => {
  it('defaults to page 1 of 25', () => {
    expect(q('')).toEqual({ page: 1, pageSize: 25 });
  });

  it('maps an API status to the stored value', () => {
    expect(q('?status=draft').status).toBe('Draft');
    expect(q('?status=APPROVED').status).toBe('Approved');
  });

  it('refuses a status the resource does not have, instead of returning everything', () => {
    expect(reason(() => q('?status=paid'))).toMatch(/^VALIDATION_FAILED: status must be one of/);
    expect(q('?status=paid', INVOICE_STATUSES).status).toBe('Paid');
  });

  it('refuses bad paging', () => {
    for (const s of ['?page=0', '?page=1.5', '?page=abc', '?page_size=0', '?page_size=101']) {
      expect(reason(() => q(s))).toMatch(/^VALIDATION_FAILED/);
    }
    expect(q('?page=3&page_size=100')).toMatchObject({ page: 3, pageSize: 100 });
  });

  it('accepts only a uuid customer_id, so a bad id is a 422 and not a database error', () => {
    expect(reason(() => q('?customer_id=1 or 1=1'))).toMatch(/customer_id must be/);
    expect(q('?customer_id=22222222-2222-4222-8222-222222222222').customerId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('normalises created_since to an ISO timestamp', () => {
    expect(q('?created_since=2026-11-01').createdSince).toBe('2026-11-01T00:00:00.000Z');
    expect(reason(() => q('?created_since=yesterday'))).toMatch(/created_since must be/);
  });

  it('says updated_since is unsupported rather than ignoring it', () => {
    expect(reason(() => q('?updated_since=2026-11-01'))).toMatch(/updated_since is not supported yet/);
  });

  it('never reads a tenant from the query', () => {
    expect(q('?shop_id=other&organization_id=other')).toEqual({ page: 1, pageSize: 25 });
  });

  it('reports has_more from the total', () => {
    expect(pageMeta({ page: 1, pageSize: 25 }, 26)).toEqual({ page: 1, page_size: 25, total: 26, has_more: true });
    expect(pageMeta({ page: 2, pageSize: 25 }, 50).has_more).toBe(false);
  });
});

describe('status names', () => {
  it('lower-cases the stored status', () => {
    expect(apiStatus('Approved')).toBe('approved');
    expect(apiStatus('')).toBe('draft');
    expect(apiStatus('Partially Paid')).toBe('partially_paid');
  });

  it('round-trips every mapped status', () => {
    for (const [api, stored] of [...Object.entries(ESTIMATE_STATUSES), ...Object.entries(INVOICE_STATUSES)]) {
      expect(apiStatus(stored)).toBe(api);
    }
  });
});

describe('the public estimate', () => {
  const record = { ...mapEstimateRow(estimateRow), provenance: provenanceOf(estimateRow) };
  const out = presentEstimate(record);
  const json = JSON.stringify(out);

  it('never contains internal cost, markup or procurement data', () => {
    expect(json).not.toMatch(/"cost"|"markup"|partsSource|secret-supplier|shop_id/);
    for (const line of out.lines) {
      expect(Object.keys(line).sort()).toEqual(
        ['amount', 'currency', 'description', 'lao_description', 'note', 'qty', 'rate'],
      );
    }
  });

  it('totals exactly as the staff screen does', () => {
    const t = calculateEstimateTotals({
      currency: record.currency, lines: record.lines, discount: record.discount, taxRate: record.taxRate,
    });
    expect(out.totals).toMatchObject({
      subtotal: money(t.subtotal), discount: money(t.discount), tax: money(t.tax), total: money(t.total),
    });
    // 2 × 1250.5 + 800 = 3301 THB; − 100 = 3201; × 1.07 = 3425.07
    expect(out.totals.total).toBe(3425.07);
  });

  it('reports the other-currency line instead of dropping it', () => {
    expect(out.totals.line_totals_by_currency).toEqual({ THB: 3301, USD: 45 });
  });

  it('a line with no currency is in the document currency', () => {
    expect(out.lines[1].currency).toBe('THB');
    expect(out.lines[1].lao_description).toBe('ຄ່າແຮງ');
  });

  it('uses the API status and says it was made in the app', () => {
    expect(out.status).toBe('approved');
    expect(out.created_via).toBe('app');
    expect(presentEstimate({ ...record, provenance: { createdVia: 'api', createdByApiKeyId: 'k' } }).created_via).toBe('api');
  });

  it('does not expose which key created it', () => {
    expect(json).not.toMatch(/api_key/);
  });
});

describe('the public invoice and what has been paid on it', () => {
  const invoiceRow = {
    number: 'INV-0101', shop_id: 'shop-a', customer: 'Somchai', customer_id: estimateRow.customer_id,
    vehicle: '2019 Toyota Hilux', status: 'Sent', currency: 'USD', discount: 0, shop_supplies: 0,
    tax_rate: 0, notes: '', due_date: '2026-12-01', paid_date: null, created_at: '2026-11-20T00:00:00Z',
    lines: [{ description: 'Service', note: '', qty: 1, rate: 300, cost: 120, markup: 0.5 }],
    source_estimate_id: estimateRow.id,
  };
  const invoice = {
    ...mapInvoiceRow(invoiceRow), provenance: provenanceOf(invoiceRow), sourceEstimateId: estimateRow.id,
  };
  const pay = (id: string, amount: number, currency = 'USD', extra: Record<string, unknown> = {}) =>
    mapPaymentRow({ id, invoice_number: 'INV-0101', amount, currency, entry_type: 'payment', ...extra });

  const entries = [
    pay('p1', 100),
    pay('p2', 50),
    pay('p3', -50, 'USD', { entry_type: 'reversal', reverses_payment_id: 'p2' }),
    pay('p4', 1000, 'THB'),
    mapPaymentRow({ id: 'p5', invoice_number: 'INV-9999', amount: 999, currency: 'USD' }),
  ];

  it('nets reversals and reports, never converts, another currency', () => {
    const out = presentInvoice(invoice, entries);
    expect(out.amount_paid).toBe(100);
    expect(out.balance_due).toBe(200);
    expect(out.currency_mismatches).toEqual([{ currency: 'THB', amount: 1000 }]);
  });

  it('ignores payments on other invoices', () => {
    expect(presentInvoice(invoice, entries).amount_paid).toBe(100);
  });

  it('agrees with the receivables report', () => {
    const [r] = receivablesFrom([invoice], entries, '2026-11-25');
    const s = settlementFor(getEffectiveTotal(invoice), entries.filter(e => e.invoiceNumber === 'INV-0101'));
    expect(s.amount_paid).toBe(r.paid);
    expect(s.balance_due).toBe(r.balance);
    expect(s.currency_mismatches).toEqual(r.currencyMismatches);
  });

  it('shows an overpayment rather than a negative balance', () => {
    const s = settlementFor({ amount: 300, currency: 'USD' }, [pay('a', 350)]);
    expect(s).toMatchObject({ amount_paid: 350, balance_due: 0, overpaid: 50 });
  });

  it('carries the source estimate, and no cost or markup', () => {
    const out = presentInvoice(invoice, []);
    expect(out.estimate_id).toBe(estimateRow.id);
    expect(JSON.stringify(out)).not.toMatch(/"cost"|"markup"|shop_id/);
  });
});

describe('line totals', () => {
  it('sums per currency without float noise', () => {
    expect(lineTotalsByCurrency([
      { description: '', note: '', qty: 1, rate: 0.1 }, { description: '', note: '', qty: 1, rate: 0.2 },
    ], 'USD')).toEqual({ USD: 0.3 });
  });
});

describe('document scopes', () => {
  it('exist for read and draft write, and nothing else', () => {
    const doc = API_SCOPES.filter(s => s.startsWith('estimates:') || s.startsWith('invoices:'));
    expect([...doc].sort()).toEqual(['estimates:read', 'estimates:write', 'invoices:read', 'invoices:write']);
  });

  it('read scopes never unlock a write', () => {
    const caps = capabilitiesForScopes(['estimates:read', 'invoices:read']);
    expect(caps.sort()).toEqual(['estimates.read', 'invoices.read', 'payments.read']);
  });

  it('no scope unlocks recording or reversing a payment', () => {
    const caps = capabilitiesForScopes([...API_SCOPES]);
    expect(caps).not.toContain('payments.record');
    expect(caps).not.toContain('payments.reverse');
  });

  it('write scopes can check a customer and vehicle but never change them', () => {
    for (const s of ['estimates:write', 'invoices:write']) {
      const caps = capabilitiesForScopes([s]);
      expect(caps).toEqual(expect.arrayContaining(['customers.read', 'vehicles.read']));
      expect(caps).not.toContain('customers.manage');
      expect(caps).not.toContain('vehicles.manage');
    }
  });
});
