'use client';

import { useState } from 'react';
import { Panel } from '@/components/Panel';
import {
  explainDtc,
  draftEstimateFromInspection,
  draftCustomerMessage,
  summarizeInvoice,
  summarizeRepairCase,
  type DtcExplanationResult,
  type EstimateDraftResult,
  type CustomerMessageResult,
  type InvoiceSummaryResult,
  type RepairCaseSummaryResult,
} from '@/services/aiService';
import { AI_TASK_TYPES } from '@/lib/validation/schemas';

type TaskType = typeof AI_TASK_TYPES[number];

const TASK_LABELS: Record<TaskType, string> = {
  dtc_explanation:    'DTC Code Explanation',
  estimate_draft:     'Estimate Draft from Inspection',
  customer_message:   'Customer Message Draft',
  invoice_summary:    'Invoice Summary',
  repair_case_summary:'Repair Case Summary',
};

const TASK_DESCRIPTIONS: Record<TaskType, string> = {
  dtc_explanation:    'Explain diagnostic trouble codes in plain language for customers and technicians.',
  estimate_draft:     'Generate estimate line items from inspection findings.',
  customer_message:   'Draft professional SMS or email update for the customer.',
  invoice_summary:    'Generate a professional narrative summary for the invoice.',
  repair_case_summary:'Summarize a completed repair case for the knowledge base.',
};

const EXAMPLE_CONTEXTS: Record<TaskType, string> = {
  dtc_explanation: JSON.stringify({
    codes: ['P0300', 'P0301'],
    make: 'Toyota',
    model: 'Camry',
    year: '2019',
    engine: '2.5L 4-Cyl',
    mileage: 85000,
  }, null, 2),
  estimate_draft: JSON.stringify({
    make: 'Honda',
    model: 'Civic',
    year: '2020',
    mileage: 62000,
    laborRate: 85,
    currency: 'USD',
    findings: [
      { label: 'Brake Pads - Front', finding: 'Fail', severity: 'High' },
      { label: 'Air Filter', finding: 'Needs Attention', severity: 'Medium' },
    ],
  }, null, 2),
  customer_message: JSON.stringify({
    customerName: 'John Smith',
    vehicle: '2020 Honda Civic',
    messageType: 'status update',
    status: 'In Progress',
    repairStage: 'in_repair',
    details: 'Brake pads replaced, waiting for rotors to arrive.',
    shopName: 'D1 Imports',
    channel: 'SMS',
  }, null, 2),
  invoice_summary: JSON.stringify({
    customerName: 'Jane Doe',
    make: 'Toyota',
    model: 'RAV4',
    year: '2021',
    currency: 'USD',
    total: 650,
    lines: [
      { description: 'Brake pad replacement - front', qty: 1, rate: 280 },
      { description: 'Labor', qty: 2, rate: 85 },
    ],
  }, null, 2),
  repair_case_summary: JSON.stringify({
    make: 'Ford',
    model: 'F-150',
    year: '2018',
    engine: '5.0L V8',
    mileage: 98000,
    complaint: 'Rough idle and check engine light',
    codes: ['P0300', 'P0301'],
    symptoms: ['Rough idle at stop', 'Slight hesitation on acceleration'],
    finalFix: 'Replaced ignition coil on cylinder 1',
    outcome: 'Customer reported smooth idle after repair',
  }, null, 2),
};

type AiResult =
  | DtcExplanationResult
  | EstimateDraftResult
  | CustomerMessageResult
  | InvoiceSummaryResult
  | RepairCaseSummaryResult;

export function AiView() {
  const [taskType, setTaskType] = useState<TaskType>('dtc_explanation');
  const [contextJson, setContextJson] = useState(EXAMPLE_CONTEXTS.dtc_explanation);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const [jsonError, setJsonError] = useState('');

  function handleTaskChange(type: TaskType) {
    setTaskType(type);
    setContextJson(EXAMPLE_CONTEXTS[type]);
    setResult(null);
    setError('');
    setJsonError('');
  }

  function validateJson(val: string): Record<string, unknown> | null {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }

  async function handleRun() {
    setJsonError('');
    setError('');
    setResult(null);

    const ctx = validateJson(contextJson);
    if (!ctx) {
      setJsonError('Invalid JSON — please check the context input.');
      return;
    }

    setLoading(true);
    try {
      let res;
      if (taskType === 'dtc_explanation') {
        res = await explainDtc(ctx as Parameters<typeof explainDtc>[0]);
      } else if (taskType === 'estimate_draft') {
        res = await draftEstimateFromInspection(ctx as Parameters<typeof draftEstimateFromInspection>[0]);
      } else if (taskType === 'customer_message') {
        res = await draftCustomerMessage(ctx as Parameters<typeof draftCustomerMessage>[0]);
      } else if (taskType === 'invoice_summary') {
        res = await summarizeInvoice(ctx as Parameters<typeof summarizeInvoice>[0]);
      } else {
        res = await summarizeRepairCase(ctx as Parameters<typeof summarizeRepairCase>[0]);
      }
      setResult(res.result as AiResult);
      setIsMock(res.mock);
      setModel(res.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Panel title="AI Copilot" hint="Internal AI testing console — select a task, review the context, and run">
        {/* Task selector */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {AI_TASK_TYPES.map(type => (
            <button
              key={type}
              onClick={() => handleTaskChange(type)}
              className={`btn ${taskType === type ? 'primary' : ''}`}
              style={{ fontSize: 12 }}
            >
              {TASK_LABELS[type]}
            </button>
          ))}
        </div>

        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 14px' }}>
          {TASK_DESCRIPTIONS[taskType]}
        </p>

        {/* Context input */}
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Context JSON</label>
          <textarea
            value={contextJson}
            onChange={e => { setContextJson(e.target.value); setJsonError(''); }}
            rows={14}
            style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
          />
          {jsonError && <span style={{ color: 'var(--danger, #cc0000)', fontSize: 12 }}>{jsonError}</span>}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn primary"
            onClick={handleRun}
            disabled={loading}
            style={{ minWidth: 140 }}
          >
            {loading ? '⏳ Running…' : '▶ Run AI Task'}
          </button>
          {result && (
            <button className="btn" onClick={() => { setResult(null); setError(''); }} style={{ fontSize: 12 }}>
              Clear
            </button>
          )}
          {model && (
            <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 20, padding: '3px 10px' }}>
              {isMock ? '🔶 MOCK MODE' : `🤖 ${model}`}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(204,0,0,0.08)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 8, color: '#cc0000', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}>AI Response</strong>
              {isMock && (
                <span style={{ fontSize: 11, color: '#d97706', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 20, padding: '2px 9px', fontWeight: 700 }}>
                  ⚠ Mock — Add ANTHROPIC_API_KEY for real responses
                </span>
              )}
            </div>
            <pre style={{
              background: 'var(--surface-soft)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: 16,
              fontSize: 12,
              lineHeight: 1.6,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 500,
              overflowY: 'auto',
            }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </Panel>

      <Panel title="AI Governance" hint="Controls required for production AI in an automotive CRM">
        <table>
          <thead>
            <tr><th>Control</th><th>Status</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {[
              ['Human approval required', '✅ Enforced', 'AI drafts — staff approve before sending to customer'],
              ['API key management', '✅ Server-only', 'ANTHROPIC_API_KEY never exposed to browser'],
              ['Mock mode', '✅ Active', 'Works without API key — returns example responses'],
              ['Usage logging', '✅ Schema ready', 'ai_usage_logs table — run migration to activate'],
              ['Shop-scoped data', '✅ RLS enforced', 'Context sent to AI is scoped to current shop'],
              ['Audit trail', '🔜 Planned', 'Track who accepted / edited / rejected AI suggestions'],
              ['Rate limiting', '🔜 Planned', 'Per-shop daily limits (AI_DAILY_LIMIT_* env vars)'],
              ['Privacy consent', '🔜 Planned', 'Customer data to AI requires shop admin consent setting'],
            ].map(([control, status, notes], i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{control}</td>
                <td>{status}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
