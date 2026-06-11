'use client';

import { useState } from 'react';
import { LOGO_SRC } from '@/lib/logo';
import Link from 'next/link';
import { usePlan } from '@/lib/usePlan';

/* ── CONTENT ──────────────────────────────────────────────────── */

const FREE_SECTIONS = [
  {
    id: 'getting-started',
    icon: '🚀',
    title: 'Getting Started',
    subsections: [
      {
        title: 'Creating Your Account',
        content: `Head to redlined1.com and click "Get Started". Fill in your name, shop name, email, and password. You'll receive a confirmation email — click the link to verify your address. Once verified, sign in and you'll land on your dashboard with a 7-day full-access trial automatically activated.`,
      },
      {
        title: 'Setting Up Your Shop Profile',
        content: `Go to Settings → Shop Settings. Enter your business name, address, phone, and upload your logo. This information appears on all your invoices, estimates, and inspection reports sent to customers. Take 5 minutes here before creating your first job — your customers will see a professional branded document.`,
      },
      {
        title: 'Navigating the Dashboard',
        content: `The left sidebar is your main navigation. Each icon represents a module: Customers, Vehicles, Job Cards, Invoices, Estimates, Payments, Inspections, Scheduling, Parts, Technicians, and Settings. The dashboard gives you a live snapshot of open jobs, unpaid invoices, and recent activity. Numbers in the sidebar badges update in real time.`,
      },
    ],
  },
  {
    id: 'customers',
    icon: '👤',
    title: 'Customer Management',
    subsections: [
      {
        title: 'Adding a New Customer',
        content: `Click "Customers" in the sidebar, then "Add Customer". Enter their name, phone number, and email address. You can also add their address and any notes (e.g., "prefers SMS"). Hit Save. The customer is now in your database and can be linked to vehicles, job cards, invoices, and inspection reports.`,
      },
      {
        title: 'Searching & Filtering Customers',
        content: `Use the search bar at the top of the Customers screen to find anyone by name, phone, or email. You can also sort the list by date added, name, or number of vehicles. Click any customer row to open their full profile including their vehicle list, job history, and all past invoices.`,
      },
      {
        title: 'Customer Communication',
        content: `From a customer's profile, you can send emails or SMS messages directly. When you send an invoice or estimate, the customer receives a branded email with a link to view and pay online. All sent communications are logged in the customer's activity history so you always know what was sent and when.`,
      },
    ],
  },
  {
    id: 'invoices',
    icon: '🧾',
    title: 'Invoices',
    subsections: [
      {
        title: 'Creating Your First Invoice',
        content: `Go to Invoices → New Invoice. Select the customer from the dropdown (or create one inline). Add line items: labour, parts, and fees. Each line has a description, quantity, and rate. Redlined1 auto-calculates the subtotal, tax, and total. When ready, click Send — the customer gets a professional PDF via email with a Pay Now button.`,
      },
      {
        title: 'Invoice Statuses',
        content: `Invoices move through four statuses: Draft (not sent), Sent (emailed to customer), Paid (payment received), and Overdue (past due date with no payment). You can manually mark invoices as paid if you collect cash or bank transfer. Overdue invoices appear highlighted in red on your dashboard.`,
      },
      {
        title: 'Adding Tax to Invoices',
        content: `Set your default tax rate in Settings → Tax Settings. Once set, it applies automatically to all new invoices. You can override the rate on individual line items or the whole invoice if needed. Tax amounts are shown as a separate line on the invoice so customers can clearly see what they're being charged.`,
      },
    ],
  },
];

const PAID_SECTIONS = [
  {
    id: 'vehicles',
    icon: '🚗',
    title: 'Vehicle Management',
    subsections: [
      {
        title: 'Adding Vehicles to a Customer',
        content: `Open a customer profile and click "Add Vehicle". Enter the make, model, year, VIN, registration/plate number, and colour. You can add multiple vehicles per customer. Each vehicle maintains its own complete service history — every job card, inspection, and invoice linked to that vehicle is visible in one place.`,
      },
      {
        title: 'Vehicle Service History',
        content: `Click any vehicle to see its full timeline: every job card, inspection report, and invoice ever linked to it. This is invaluable when a returning customer brings in the same car. You can see exactly what was done last visit, flag recurring issues, and recommend upcoming services based on mileage intervals.`,
      },
      {
        title: 'Mileage Tracking',
        content: `Record the odometer reading every time a vehicle comes in. Redlined1 tracks mileage over time and can flag when a vehicle is approaching a service interval (e.g., oil change at every 5,000 km). This helps you proactively reach out to customers before they think to call you.`,
      },
    ],
  },
  {
    id: 'job-cards',
    icon: '📋',
    title: 'Job Cards & Repair Orders',
    subsections: [
      {
        title: 'Creating a Job Card',
        content: `Job cards are the heart of your workflow. Go to Job Cards → New Job Card. Select the customer and vehicle. Add a description of the complaint or work requested. Assign a technician, set the promised date, and choose a status (Booked, In Progress, Waiting for Parts, Complete). Job cards link directly to estimates, invoices, and inspections.`,
      },
      {
        title: 'Job Card Statuses',
        content: `Use statuses to track every job in real time: Booked → In Progress → Waiting for Parts → Quality Check → Complete → Invoiced. Your dashboard shows a count for each status so you can see your shop's workload at a glance. You can filter job cards by status, technician, or date range.`,
      },
      {
        title: 'Linking Jobs to Invoices',
        content: `Once a job is complete, click "Create Invoice from Job Card". All labour lines and parts already on the job card are automatically pulled into the invoice — no re-entering data. Add any final charges, review the total, and send. The job card status updates to "Invoiced" automatically.`,
      },
      {
        title: 'Internal Notes & Attachments',
        content: `Add internal notes to a job card that are only visible to your team — not the customer. Attach photos of damage, parts diagrams, or warranty documents. Notes are timestamped and attributed to the team member who added them, creating a clear audit trail for every job.`,
      },
    ],
  },
  {
    id: 'inspections',
    icon: '🔍',
    title: 'Digital Vehicle Inspections',
    subsections: [
      {
        title: 'Starting an Inspection',
        content: `From a job card, click "Start Inspection". You'll see a checklist organised by vehicle system: Brakes, Tyres, Engine, Electrical, Fluids, Body, and more. For each item, mark it Green (pass), Yellow (monitor), or Red (needs attention). Add photos to any item directly from your phone's camera.`,
      },
      {
        title: 'Sending the Inspection Report',
        content: `When the inspection is complete, click "Send Report". The customer receives a branded email with a visual report showing traffic-light colour coding for each item. Red items include your recommended repair and price. The customer can approve work directly from their phone with one tap — you get notified instantly.`,
      },
      {
        title: 'Converting Approvals to Jobs',
        content: `When a customer approves recommended work from an inspection report, Redlined1 automatically creates a new job card for the approved items. This closes the loop from inspection → approval → repair → invoice without any manual data entry between steps.`,
      },
    ],
  },
  {
    id: 'estimates',
    icon: '📄',
    title: 'Estimates',
    subsections: [
      {
        title: 'Creating an Estimate',
        content: `Go to Estimates → New Estimate. Select the customer, add labour and parts line items, and include notes about what the work covers. Send the estimate via email — the customer sees a professional PDF and can click "Approve" or "Decline". Approved estimates convert to job cards and invoices in one click.`,
      },
      {
        title: 'Estimate Expiry & Follow-Up',
        content: `Set an expiry date on estimates to create urgency. Redlined1 can send automatic reminder emails to customers who haven't responded. When an estimate expires, it's flagged in your dashboard so you can follow up manually. Tracking estimate conversion rates helps you identify pricing and communication improvements.`,
      },
    ],
  },
  {
    id: 'parts',
    icon: '🧰',
    title: 'Parts & Inventory',
    subsections: [
      {
        title: 'Adding Parts to Inventory',
        content: `Go to Parts → Add Part. Enter the part name, part number, supplier, cost price, sell price, and current stock quantity. Set a reorder point — when stock falls below this number, the part appears on your low-stock report. You can bulk-import parts from a CSV file if you have an existing parts list.`,
      },
      {
        title: 'Adding Parts to a Job Card',
        content: `While working on a job card, click "Add Part". Search your inventory by name or part number. Select the part and quantity — it's added to the job card and deducted from your inventory automatically. The sell price is pulled from your parts database, but you can override it per job if needed.`,
      },
      {
        title: 'Stock & Reorder Reports',
        content: `Go to Parts → Low Stock Report to see everything that needs reordering. The report shows current quantity, reorder point, supplier, and part number — everything you need to place an order. You can export this list as a CSV to send to your supplier directly.`,
      },
    ],
  },
  {
    id: 'technicians',
    icon: '👷',
    title: 'Technician Management',
    subsections: [
      {
        title: 'Adding Technicians',
        content: `Go to Technicians → Add Technician. Enter their name, role, and contact details. Each technician can be assigned to job cards. Their work history, completed jobs, and billed hours are all tracked automatically as you create and complete job cards assigned to them.`,
      },
      {
        title: 'Tracking Technician Performance',
        content: `The Technician report shows each tech's completed jobs, total billed hours, revenue generated, and average job time. Use this to identify your most productive team members, spot bottlenecks, and have data-backed conversations about performance. Filter by date range to review weekly or monthly output.`,
      },
    ],
  },
  {
    id: 'scheduling',
    icon: '📅',
    title: 'Scheduling',
    subsections: [
      {
        title: 'Booking Appointments',
        content: `Go to Scheduling to see your calendar view. Click any time slot to create a new appointment. Link the appointment to an existing customer and vehicle, or create a new customer inline. Set the duration, assign a technician, and add notes. Confirmed appointments are visible to your whole team immediately.`,
      },
      {
        title: 'Calendar Views',
        content: `Switch between Day, Week, and Month views using the buttons at the top of the schedule screen. The Day view shows all booked jobs in time-slot order and is ideal for your daily workflow. The Week view helps you plan capacity. Colour-coded by technician so you can see workload distribution at a glance.`,
      },
      {
        title: 'Automated Reminders',
        content: `Redlined1 can send automatic SMS or email appointment reminders to customers 24 hours and 2 hours before their scheduled time. Enable this in Settings → Notifications. Reminders dramatically reduce no-shows and save your service desk from manual reminder calls.`,
      },
    ],
  },
  {
    id: 'payments',
    icon: '💳',
    title: 'Payments',
    subsections: [
      {
        title: 'Collecting Online Payments',
        content: `When you send an invoice, the customer receives a "Pay Now" link. They can pay via credit card or debit card directly. Payments are processed securely and the invoice is automatically marked as paid. You receive a notification the moment payment is confirmed. No chasing, no manual reconciliation.`,
      },
      {
        title: 'Recording Manual Payments',
        content: `If a customer pays cash, bank transfer, or cheque, open the invoice and click "Record Payment". Choose the payment method, enter the amount and date, and save. The invoice status updates to Paid. Partial payments are supported — record multiple payments against a single invoice until the balance is cleared.`,
      },
      {
        title: 'Payment Reports',
        content: `Go to Payments to see all received payments sorted by date. Filter by date range, payment method, or technician. Export to CSV for your accountant or bookkeeping software. The report shows gross revenue, outstanding balances, and payment method breakdown — all the numbers your accountant needs at tax time.`,
      },
    ],
  },
  {
    id: 'mobile',
    icon: '📱',
    title: 'Mobile Mechanic Workflow',
    subsections: [
      {
        title: 'Working Entirely From Your Phone',
        content: `Redlined1 is fully responsive — every feature works on your phone's browser. Save redlined1.com to your home screen for a near-app experience. When you arrive at a job, open a new job card, attach the customer and vehicle, start an inspection, capture photos, and send the report — all before you pick up a single tool.`,
      },
      {
        title: 'On-Site Invoicing',
        content: `When the job is done, convert the job card to an invoice in one tap. Review the line items, add any final charges, and hit Send. The customer receives the invoice immediately. They can pay via the link on the spot — you leave the driveway with the money already in your account.`,
      },
      {
        title: 'Logging Service Addresses',
        content: `Mobile jobs often happen at different locations. Add the service address to each job card in the Location field. This creates a history of where each vehicle was serviced, useful for warranty records, callbacks, and territory planning. You can filter your job history by location to see which suburbs generate the most work.`,
      },
    ],
  },
  {
    id: 'settings',
    icon: '⚙️',
    title: 'Settings & Customisation',
    subsections: [
      {
        title: 'Shop Branding',
        content: `Go to Settings → Shop Settings to upload your logo, set your business colours, and update your contact details. Your branding appears on all customer-facing documents: invoices, estimates, inspection reports, and confirmation emails. A professional first impression builds trust before the customer even opens their wallet.`,
      },
      {
        title: 'Tax Configuration',
        content: `Set your default tax rate in Settings → Tax. You can create multiple tax rates if you service different categories (e.g., parts vs. labour at different rates). Tax is applied automatically to new invoices and estimates based on your defaults, but can be overridden on individual documents.`,
      },
      {
        title: 'Notification Preferences',
        content: `Control exactly what triggers an alert. Go to Settings → Notifications to enable or disable: new appointment bookings, invoice paid confirmations, inspection approvals, and low stock alerts. You can choose to receive notifications via email, in-app, or both.`,
      },
      {
        title: 'User Roles & Permissions',
        content: `Pro Plus subscribers can invite additional team members under Settings → Users. Assign roles: Owner (full access), Manager (all modules, no billing), Technician (jobs and inspections only), or Service Advisor (customers, estimates, invoices). Each role restricts access to only the screens that user needs.`,
      },
    ],
  },
];

const FAQS = [
  { q: 'Is there a free plan?', a: 'Yes. Redlined1\'s free plan gives you access to core tools with up to 10 customers. You also get a full 7-day trial of Pro features when you first sign up — no credit card required.' },
  { q: 'Can I use Redlined1 on my phone?', a: 'Absolutely. Redlined1 is fully mobile-responsive. Every feature — job cards, invoices, inspections, payments — works on any smartphone browser. Mobile mechanics use it entirely from the road.' },
  { q: 'How do I cancel my subscription?', a: 'Go to Settings → Subscription and click Cancel Plan. Your account stays active until the end of your current billing period. No cancellation fees, no hoops to jump through.' },
  { q: 'Can my technicians have their own logins?', a: 'Yes, on the Pro Plus plan. You can invite team members and assign each one a role with the appropriate level of access. Technicians only see jobs assigned to them.' },
  { q: 'Does Redlined1 process credit card payments?', a: 'Yes. When you send an invoice, customers receive a secure Pay Now link. Payments are processed via Stripe. Funds settle to your connected bank account within 2 business days.' },
  { q: 'Can I import my existing customer data?', a: 'Yes. Go to Settings → Import and upload a CSV file with your customer list. The import wizard maps your columns to Redlined1 fields. Vehicles and service history can also be imported from CSV.' },
  { q: 'What happens after my 7-day trial ends?', a: 'Your account automatically moves to the free plan. You keep all your data. Features beyond the free plan limits become locked until you upgrade. Nothing is deleted.' },
  { q: 'Is my data secure?', a: 'Yes. All data is stored in Supabase (PostgreSQL) with row-level security — each shop only ever sees its own data. All connections use HTTPS/TLS encryption. Your data is never shared with other users or third parties.' },
  { q: 'Can I customise invoices with my logo?', a: 'Yes. Upload your logo and set your shop colours in Settings → Shop Settings. Your branding appears on all invoices, estimates, and inspection reports sent to customers.' },
  { q: 'Is there a contract or lock-in period?', a: 'No contracts. Redlined1 is month-to-month (or yearly if you prefer the discount). Cancel any time from your account settings.' },
  { q: 'How do digital inspection reports work?', a: 'You go through a system checklist on your phone, mark each item green/yellow/red, and attach photos. Tap Send — the customer gets a visual branded report via email and can approve recommended repairs with one click.' },
  { q: 'Can I switch from monthly to yearly billing?', a: 'Yes. Go to Settings → Subscription and click Switch to Yearly. The change takes effect at your next billing date and saves you up to $119 per year.' },
];

/* ── COMPONENT ────────────────────────────────────────────────── */

export default function HelpPage() {
  const { status, loading } = usePlan();
  const isPaid = status === 'pro' || status === 'trial';
  const [activeSection, setActiveSection] = useState('getting-started');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const allSections = [...FREE_SECTIONS, ...PAID_SECTIONS];

  return (
    <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", background: '#07070a', color: '#fff', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(7,7,10,0.95)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 5%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 62 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/portal" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <img src={LOGO_SRC} alt="Redlined1" style={{ height: 38, width: 'auto', objectFit: 'contain', mixBlendMode: 'screen' }} />
          </Link>
          <span style={{ color: '#444', fontSize: 14 }}>/</span>
          <span style={{ color: '#888', fontSize: 14 }}>Help & Manual</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/" style={{ border: '1px solid rgba(255,255,255,0.12)', color: '#ccc', padding: '7px 16px', borderRadius: 8, textDecoration: 'none', fontSize: 13 }}>← Back to App</Link>
          {!isPaid && !loading && (
            <Link href="/signup" style={{ background: '#cc0000', color: '#fff', padding: '7px 16px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>Upgrade for Full Access</Link>
          )}
        </div>
      </nav>

      {/* HERO */}
      <div style={{ background: 'linear-gradient(135deg,#0a0000 0%,#1a0000 60%,#0a0000 100%)', padding: '60px 5% 50px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📖</div>
        <h1 style={{ fontSize: 'clamp(28px,3vw,44px)', fontWeight: 900, marginBottom: 14 }}>Redlined1 Help & Manual</h1>
        <p style={{ color: '#888', fontSize: 16, maxWidth: 560, margin: '0 auto 24px', lineHeight: 1.6 }}>
          Everything you need to run your shop like a pro. Step-by-step guides for every feature.
        </p>
        {!isPaid && !loading && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 10, padding: '12px 20px', fontSize: 14 }}>
            <span>🔒</span>
            <span style={{ color: '#ff9090' }}>Advanced guides are locked on the free plan. <Link href="/signup" style={{ color: '#cc0000', fontWeight: 700, textDecoration: 'none' }}>Upgrade to unlock everything →</Link></span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', maxWidth: 1280, margin: '0 auto', padding: '0 5%' }}>

        {/* SIDEBAR TOC */}
        <aside style={{ width: 260, flexShrink: 0, padding: '32px 0', position: 'sticky', top: 62, height: 'calc(100vh - 62px)', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, padding: '0 16px' }}>Free Guides</div>
          {FREE_SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{ width: '100%', textAlign: 'left', padding: '9px 16px', background: activeSection === s.id ? 'rgba(204,0,0,0.12)' : 'transparent', border: activeSection === s.id ? '1px solid rgba(204,0,0,0.3)' : '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: activeSection === s.id ? '#fff' : '#888', fontSize: 13, fontWeight: activeSection === s.id ? 700 : 400, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span>{s.icon}</span>{s.title}
            </button>
          ))}

          <div style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: 2, textTransform: 'uppercase', margin: '20px 0 12px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            Pro Guides {!isPaid && <span style={{ fontSize: 10, background: '#cc0000', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>PAID</span>}
          </div>
          {PAID_SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{ width: '100%', textAlign: 'left', padding: '9px 16px', background: activeSection === s.id ? 'rgba(204,0,0,0.12)' : 'transparent', border: activeSection === s.id ? '1px solid rgba(204,0,0,0.3)' : '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: activeSection === s.id ? '#fff' : (isPaid ? '#888' : '#444'), fontSize: 13, fontWeight: activeSection === s.id ? 700 : 400, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span>{s.icon}</span>{s.title}{!isPaid && <span style={{ marginLeft: 'auto', fontSize: 11 }}>🔒</span>}
            </button>
          ))}

          <div style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: 2, textTransform: 'uppercase', margin: '20px 0 12px', padding: '0 16px' }}>Support</div>
          <button onClick={() => setActiveSection('faq')} style={{ width: '100%', textAlign: 'left', padding: '9px 16px', background: activeSection === 'faq' ? 'rgba(204,0,0,0.12)' : 'transparent', border: activeSection === 'faq' ? '1px solid rgba(204,0,0,0.3)' : '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: activeSection === 'faq' ? '#fff' : '#888', fontSize: 13, fontWeight: activeSection === 'faq' ? 700 : 400, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span>❓</span>FAQ
          </button>
        </aside>

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, padding: '40px 0 80px 48px', minWidth: 0 }}>

          {/* Section content */}
          {allSections.map(section => {
            if (activeSection !== section.id) return null;
            const isLocked = !isPaid && PAID_SECTIONS.some(s => s.id === section.id);

            return (
              <div key={section.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
                  <span style={{ fontSize: 36 }}>{section.icon}</span>
                  <div>
                    <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{section.title}</h2>
                    {isLocked && <span style={{ fontSize: 12, color: '#cc0000', fontWeight: 600 }}>🔒 Pro feature — upgrade to read full guide</span>}
                  </div>
                </div>

                {section.subsections.map((sub, i) => {
                  const blurred = isLocked && i > 0;
                  return (
                    <div key={i} style={{ marginBottom: 36, position: 'relative' }}>
                      {blurred && (
                        <div style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(7,7,10,0.7)', backdropFilter: 'blur(6px)', borderRadius: 14 }}>
                          <span style={{ fontSize: 28 }}>🔒</span>
                          <p style={{ color: '#ccc', fontSize: 14, textAlign: 'center', margin: 0 }}>This section is for Pro subscribers.</p>
                          <Link href="/signup" style={{ background: '#cc0000', color: '#fff', padding: '9px 22px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>Upgrade to Unlock →</Link>
                        </div>
                      )}
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '24px 26px', filter: blurred ? 'blur(3px)' : 'none', userSelect: blurred ? 'none' : 'auto' }}>
                        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 26, height: 26, background: 'rgba(204,0,0,0.2)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#cc0000', flexShrink: 0 }}>{i + 1}</span>
                          {sub.title}
                        </h3>
                        <p style={{ color: '#aaa', fontSize: 15, lineHeight: 1.75, margin: 0 }}>{sub.content}</p>
                      </div>
                    </div>
                  );
                })}

                {isLocked && (
                  <div style={{ background: 'rgba(204,0,0,0.08)', border: '1px solid rgba(204,0,0,0.25)', borderRadius: 14, padding: '28px', textAlign: 'center', marginTop: 16 }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
                    <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Unlock Full Documentation</h3>
                    <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>Upgrade to Pro or Pro Plus to access all guides, step-by-step tutorials, and advanced feature documentation.</p>
                    <Link href="/signup" style={{ background: '#cc0000', color: '#fff', padding: '12px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 14, display: 'inline-block' }}>Upgrade Now — From $29.99/mo →</Link>
                  </div>
                )}
              </div>
            );
          })}

          {/* FAQ */}
          {activeSection === 'faq' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
                <span style={{ fontSize: 36 }}>❓</span>
                <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Frequently Asked Questions</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {FAQS.map((faq, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${openFaq === i ? 'rgba(204,0,0,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                    <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: '100%', padding: '18px 22px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>{faq.q}</span>
                      <span style={{ color: '#cc0000', fontSize: 18, transition: 'transform 0.2s', transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0)' }}>+</span>
                    </button>
                    {openFaq === i && (
                      <div style={{ padding: '0 22px 20px', color: '#aaa', fontSize: 14, lineHeight: 1.75, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <p style={{ margin: '16px 0 0' }}>{faq.a}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 48, background: 'rgba(204,0,0,0.08)', border: '1px solid rgba(204,0,0,0.25)', borderRadius: 14, padding: '28px', textAlign: 'center' }}>
                <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Still have questions?</h3>
                <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>Our support team typically responds within a few hours. Reach out any time.</p>
                <a href="mailto:support@redlined1.com" style={{ background: '#cc0000', color: '#fff', padding: '11px 24px', borderRadius: 9, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Contact Support →</a>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
