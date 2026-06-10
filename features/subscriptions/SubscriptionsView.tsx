'use client';

import { useState } from 'react';
import { useAppState, useAppDispatch } from '@/lib/store';
import { planCatalog } from '@/lib/mock-data';
import { StatCard } from '@/components/StatCard';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { calculateTotals as calculateInvoice } from '@/services/invoiceService';

export function SubscriptionsView() {
  const { currentPlan, users, customers, vehicles, jobCards, invoices } = useAppState();
  const dispatch = useAppDispatch();
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);

  const plan = planCatalog[currentPlan] || planCatalog.Free;
  const usage = {
    users: users.length,
    locations: 3,
    customers: customers.length,
    vehicles: vehicles.length,
    jobs: jobCards.length,
    invoices: invoices.length,
    aiCredits: 18,
  };

  return (
    <>
      <div className="grid cols-4" style={{ gridTemplateColumns: `repeat(${Object.keys(planCatalog).length}, minmax(0,1fr))` }}>
        {Object.entries(planCatalog).map(([name, p]) => (
          <StatCard key={name} label={name} value={p.price} subtext={name === currentPlan ? 'Current plan' : p.features[0]} />
        ))}
      </div>

      <div className="split">
        <Panel title="Plan Controls" hint="Switch plans to test free restrictions and paid subscriber access">
          <div className="form-row">
            <div className="field">
              <label>Current Plan</label>
              <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)}>
                {Object.keys(planCatalog).map(name => <option key={name}>{name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Billing Status</label>
              <select>
                <option>trialing</option><option>free</option><option>active</option><option>past_due</option><option>canceled</option>
              </select>
            </div>
            <div className="field">
              <label>Stripe Customer</label>
              <input defaultValue="cus_demo_redlined1" />
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button className="btn primary" onClick={() => dispatch({ type: 'APPLY_PLAN', plan: selectedPlan })}>Apply Plan</button>
            </div>
          </div>
        </Panel>

        <Panel title="Feature Gates" hint="Free users are restricted; paid subscribers unlock modules">
          <table>
            <thead>
              <tr><th>Feature</th><th>Free</th><th>Starter</th><th>Pro</th><th>Enterprise</th></tr>
            </thead>
            <tbody>
              {[
                ['AI assistant', 'Locked', 'Basic', 'Included', 'Advanced'],
                ['Digital inspections', 'Locked', 'Included', 'Included', 'Included'],
                ['Parts inventory', 'Locked', 'Limited', 'Included', 'Multi-location'],
                ['Payments', 'Manual only', 'Manual', 'Stripe-ready', 'Advanced billing'],
                ['Multi-location', 'Locked', 'Locked', '3 locations', 'Unlimited'],
                ['VIN/DTC integrations', 'Mock only', 'Mock', 'Provider-ready', 'API + OEM-ready'],
              ].map((row, i) => (
                <tr key={i}>
                  <td>{row[0]}</td>
                  {row.slice(1).map((cell, j) => <td key={j}><Badge text={cell} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Usage and Limits" hint="Enforced by plan_features and subscriptions tables">
        <table>
          <thead>
            <tr><th>Limit</th><th>Usage</th><th>Meter</th><th>Status</th></tr>
          </thead>
          <tbody>
            {Object.entries(plan.limits).map(([key, limit]) => {
              const used = (usage as Record<string, number>)[key] ?? 0;
              const percent = Math.min(100, Math.round((used / limit) * 100));
              return (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{used} / {limit}</td>
                  <td>
                    <div className="meter"><span style={{ width: `${percent}%` }} /></div>
                  </td>
                  <td><Badge text={used >= limit ? 'Limit reached' : 'Available'} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
