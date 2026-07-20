import { webPageSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { PageCTA } from '@/components/seo/PageCTA';
import { PrintButton } from '@/components/seo/PrintButton';

export { metadata } from './metadata';

const SLUG = '/resources/repair-order-template';
const TITLE = 'Repair Order Template for Auto Repair Shops';
const DESCRIPTION =
  'A free, printable repair order template for independent auto repair shops. Covers customer info, vehicle details, labor lines, parts, authorization, and totals.';

export default function RepairOrderTemplatePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) })),
        }}
      />

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 32px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Resources', href: '/resources' }, { name: 'Repair Order Template', href: SLUG }]} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24, marginBottom: 32 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h1 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, lineHeight: 1.2, marginBottom: 14 }}>
              Repair Order Template
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.65, color: 'var(--muted, #555)', maxWidth: 600, margin: 0 }}>
              A complete repair order form for independent auto repair shops. Includes all
              the fields you need for customer authorization, labor lines, parts, and a
              clear final billing summary.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'flex-start' }}>
            <PrintButton />
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', fontSize: 13, color: '#1d4ed8', marginBottom: 40 }}>
          <strong>For reference only.</strong> This template is a starting point. Consult a local business attorney if you need a legally binding repair authorization form with jurisdiction-specific terms.
        </div>

        {/* The actual template */}
        <div style={{ border: '2px solid var(--line, #d1d5db)', borderRadius: 12, padding: 32, background: 'var(--surface, #fff)', maxWidth: 820, fontFamily: 'monospace, monospace', fontSize: 13 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, borderBottom: '2px solid currentColor', paddingBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>[SHOP NAME]</div>
              <div>[Shop Address]</div>
              <div>[City, State, ZIP]</div>
              <div>[Phone] | [Email]</div>
              <div>[License #]</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>REPAIR ORDER</div>
              <div>RO # _______________</div>
              <div>Date _______________</div>
              <div>Promised _______________</div>
            </div>
          </div>

          {/* Customer & Vehicle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10, borderBottom: '1px solid currentColor', paddingBottom: 4 }}>CUSTOMER</div>
              {['Name', 'Address', 'City / State / ZIP', 'Phone (mobile)', 'Phone (other)', 'Email'].map(f => (
                <div key={f} style={{ marginBottom: 8 }}>
                  <span style={{ color: 'var(--muted, #888)' }}>{f}: </span>
                  <span style={{ display: 'inline-block', borderBottom: '1px solid currentColor', minWidth: 180 }} />
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10, borderBottom: '1px solid currentColor', paddingBottom: 4 }}>VEHICLE</div>
              {['Year', 'Make', 'Model', 'Trim', 'VIN', 'License Plate', 'Mileage In', 'Mileage Out', 'Color'].map(f => (
                <div key={f} style={{ marginBottom: 8 }}>
                  <span style={{ color: 'var(--muted, #888)' }}>{f}: </span>
                  <span style={{ display: 'inline-block', borderBottom: '1px solid currentColor', minWidth: 140 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Customer complaint */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, borderBottom: '1px solid currentColor', paddingBottom: 4 }}>CUSTOMER COMPLAINT / REASON FOR VISIT</div>
            {[1, 2, 3].map(n => (
              <div key={n} style={{ marginBottom: 6, borderBottom: '1px solid var(--line, #ddd)', paddingBottom: 4 }}>
                {n}. &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              </div>
            ))}
          </div>

          {/* Labor */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, borderBottom: '1px solid currentColor', paddingBottom: 4 }}>LABOR</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['#', 'Description', 'Tech', 'Hours', 'Rate', 'Amount'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Amount' ? 'right' : 'left', padding: '6px 8px', borderBottom: '1px solid currentColor', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(n => (
                  <tr key={n}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--line, #eee)', color: 'var(--muted, #888)', width: 24 }}>{n}</td>
                    {['description', 'tech', 'hrs', 'rate', 'amt'].map(c => (
                      <td key={c} style={{ padding: '8px', borderBottom: '1px solid var(--line, #eee)' }}>
                        <div style={{ borderBottom: '1px solid var(--line, #ccc)', minHeight: 20 }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Parts */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, borderBottom: '1px solid currentColor', paddingBottom: 4 }}>PARTS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['#', 'Part Number', 'Description', 'Qty', 'Cost', 'Retail', 'Amount'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Amount' ? 'right' : 'left', padding: '6px 8px', borderBottom: '1px solid currentColor', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4].map(n => (
                  <tr key={n}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--line, #eee)', color: 'var(--muted, #888)', width: 24 }}>{n}</td>
                    {['pn', 'desc', 'qty', 'cost', 'retail', 'amt'].map(c => (
                      <td key={c} style={{ padding: '8px', borderBottom: '1px solid var(--line, #eee)' }}>
                        <div style={{ borderBottom: '1px solid var(--line, #ccc)', minHeight: 20 }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <div style={{ minWidth: 280 }}>
              {['Labor Total', 'Parts Total', 'Shop Supplies', 'Sublet', 'Subtotal', 'Tax', 'TOTAL DUE'].map((row, i) => (
                <div key={row} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 6 ? '1px solid var(--line, #eee)' : '2px solid currentColor', fontWeight: row === 'TOTAL DUE' ? 800 : 400 }}>
                  <span>{row}</span>
                  <span style={{ minWidth: 100, textAlign: 'right', borderBottom: '1px solid var(--line, #ccc)', display: 'inline-block' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Authorization */}
          <div style={{ border: '1px solid var(--line, #d1d5db)', borderRadius: 8, padding: 16, fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>AUTHORIZATION</div>
            <p style={{ margin: '0 0 12px', color: 'var(--muted, #555)' }}>
              I authorize the above repair work to be performed and necessary materials to be supplied.
              I understand payment is due upon completion. I authorize you to operate the vehicle for
              purposes of testing and/or inspection.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {['Customer Signature', 'Date', 'Advisor'].map(f => (
                <div key={f}>
                  <div style={{ color: 'var(--muted, #888)', marginBottom: 4 }}>{f}</div>
                  <div style={{ borderBottom: '1px solid currentColor', height: 24 }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Field explanations */}
        <div style={{ maxWidth: 820, marginTop: 48 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>What each section covers</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { title: 'Customer information', desc: 'Name, address, and contact details. At minimum, collect a mobile phone number for status updates and a second phone for appointment reminders.' },
              { title: 'Vehicle information', desc: 'Year, make, model, VIN, and license plate. The VIN is the definitive identifier and will help you look up technical service bulletins and recall history.' },
              { title: 'Customer complaint', desc: 'Write the customer\'s exact words. "Makes a noise when turning" is more useful than "suspension noise" — the exact description guides the diagnostic process.' },
              { title: 'Labor lines', desc: 'Each distinct service performed should be its own line — description, technician, hours billed, rate, and amount. This protects you and makes the invoice itemized and defensible.' },
              { title: 'Parts', desc: 'List part numbers, descriptions, quantity, your cost, and your retail price. This makes your markup visible internally and lets you catch pricing errors before the invoice.' },
              { title: 'Authorization', desc: 'The customer\'s signature authorizes the work and the charges. For higher-dollar jobs, consider getting a second authorization when you discover additional needed repairs.' },
            ].map(({ title, desc }) => (
              <div key={title} style={{ paddingLeft: 16, borderLeft: '3px solid var(--accent, #dc2626)' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 14, color: 'var(--muted, #666)', lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Related */}
        <div style={{ maxWidth: 820, marginTop: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Related resources</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/repair-order-software', label: 'Repair Order Software', desc: 'Go paperless with digital ROs that stay connected to customer records and invoices.' },
              { href: '/resources/digital-vehicle-inspection-checklist', label: 'DVI Checklist', desc: 'Multi-point inspection checklist to use alongside the repair order.' },
              { href: '/auto-repair-invoicing-software', label: 'Invoicing Software', desc: 'Convert your repair order to an invoice in one step.' },
            ].map(({ href, label, desc }) => (
              <a key={href} href={href} style={{ display: 'block', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit', background: 'var(--surface, #fff)' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent, #dc2626)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>{desc}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <PageCTA
        heading="Ready to go paperless?"
        subtext="Digital repair orders in RedlineD1 stay connected to estimates, invoices, and vehicle history."
        primaryLabel="Start Free"
        secondaryLabel="See Repair Order Software"
        secondaryHref="/repair-order-software"
      />
    </>
  );
}
