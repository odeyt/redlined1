'use client';

import { useAppDispatch } from '@/lib/store';
import { aiInsights } from '@/lib/mock-data';
import { StatCard } from '@/components/StatCard';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';

export function AiView() {
  const dispatch = useAppDispatch();

  return (
    <>
      <div className="grid cols-4">
        <StatCard label="Estimate drafts" value="7" subtext="Generated from job cards" />
        <StatCard label="Invoice checks" value="12" subtext="Missing PO, tax, labor, or fee flags" />
        <StatCard label="DTC summaries" value="3" subtext="Technician notes converted to customer language" />
        <StatCard label="Route suggestions" value="5" subtext="Mobile jobs sequenced by ETA and parts" />
      </div>

      <Panel title="AI Command Center" hint="Practical artificial intelligence features built around the automotive workflow">
        <table>
          <thead>
            <tr><th>AI Feature</th><th>Where It Works</th><th>Business Value</th></tr>
          </thead>
          <tbody>
            {[
              ['Smart job triage', 'Dashboard, appointments, job cards', 'Ranks jobs by approval, parts availability, SLA, location, and technician skill'],
              ['Estimate writer', 'Job cards and repair orders', 'Drafts labor, parts, complaint/cause/correction, and customer-facing recommendations'],
              ['Invoice audit', 'Invoices', 'Checks missing PO numbers, discounts, tax, shop supplies, mobile call fees, and fleet terms'],
              ['Diagnostic explainer', 'DTC lookup and scan tool', 'Turns DTCs and freeze-frame data into technician steps and plain customer summaries'],
              ['Customer follow-up', 'CRM', 'Drafts SMS/email reminders for approvals, unpaid invoices, declined work, and service intervals'],
              ['Inventory forecasting', 'Parts', 'Predicts reorder needs from scheduled jobs, fleet PM plans, and common DTC patterns'],
            ].map(([feature, where, value], i) => (
              <tr key={i}>
                <td>{feature}</td>
                <td>{where}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="split">
        <Panel title="Live AI Recommendations" hint="Operational suggestions based on the mock CRM data">
          <table>
            <thead>
              <tr><th>Area</th><th>Recommendation</th><th>Impact</th></tr>
            </thead>
            <tbody>
              {aiInsights.map((item, i) => (
                <tr key={i}>
                  <td><Badge text={item.area} /></td>
                  <td>{item.recommendation}</td>
                  <td>{item.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="AI Draft Preview" hint="Example output the advisor can edit before sending">
          <div className="empty-note">
            Hi Maya, your 60k mobile service estimate is ready. The service includes synthetic oil, cabin filter, inspection, tire rotation, and mobile service call. Total is ready for approval, and Priya can arrive during Mobile Route 1 today.
          </div>
          <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
            <button className="btn primary" onClick={() => dispatch({ type: 'SEND_AI_DRAFT' })}>
              <Icon name="send" /> Send Draft
            </button>
            <button className="btn" onClick={() => dispatch({ type: 'ATTACH_AI_NOTE' })}>
              <Icon name="clipboard" /> Attach to Job Card
            </button>
          </div>
        </Panel>
      </div>

      <Panel title="AI Governance" hint="Controls needed for a serious SaaS product">
        <table>
          <thead>
            <tr><th>Control</th><th>Purpose</th></tr>
          </thead>
          <tbody>
            {[
              ['Human approval required', 'AI drafts messages, estimates, and invoice notes but staff approve before sending'],
              ['Audit trail', 'Record who accepted, edited, or rejected each AI suggestion'],
              ['Shop knowledge base', 'Use labor guides, canned jobs, warranty rules, fleet contracts, and internal SOPs'],
              ['Privacy boundaries', 'Do not send VIN, customer, payment, or diagnostic data to external AI providers without consent and configuration'],
            ].map(([control, purpose], i) => (
              <tr key={i}><td>{control}</td><td>{purpose}</td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
