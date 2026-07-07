'use client';

/**
 * Automotive Triage Engine — Main View
 * Epic 1 / Feature 1.1
 *
 * Workflow: Vehicle → Category → Questions → Tech Notes → Summary → Job Card
 *
 * Operates in three modes:
 *   mock           — works with no AI key (default)
 *   knowledge_graph — queries internal graph for similar vehicle insights
 *   ai             — future hook (triageContextBuilder feeds the LLM)
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppDispatch } from '@/lib/store';
import {
  TriageVehicle,
  TechnicianNotes,
  AnswerMap,
  CategoryId,
  TriageSession,
} from '@/lib/triage/QuestionTypes';
import { QuestionEngine } from '@/lib/triage/QuestionEngine';
import { saveTriageSession, listTriageSessions, deleteTriageSession } from '@/services/triageService';
import { createInspection, createInspectionFromTriage, nextInspectionNumber } from '@/services/inspectionService';
import { getShopId } from '@/lib/shopStore';

import { VehicleStep }    from './steps/VehicleStep';
import { CategoryStep }   from './steps/CategoryStep';
import { QuestionsStep }  from './steps/QuestionsStep';
import { TechNotesStep }  from './steps/TechNotesStep';
import { SummaryStep }    from './steps/SummaryStep';

// ─── Knowledge Graph insight lookup (no AI) ──────────────────────────────────

async function fetchKnowledgeInsights(vehicle: TriageVehicle, categoryId: CategoryId | null): Promise<string[]> {
  if (!categoryId || !vehicle.make || !vehicle.model) return [];
  try {
    const { supabase } = await import('@/lib/supabase');
    const shopId = await getShopId();
    const { data } = await supabase
      .from('repair_cases')
      .select('symptoms, final_fix, dtc_codes')
      .eq('shop_id', shopId)
      .ilike('make', `%${vehicle.make}%`)
      .ilike('model', `%${vehicle.model}%`)
      .eq('verification_status', 'gold_verified')
      .limit(5);

    if (!data || data.length === 0) return [];
    return data
      .filter(r => r.final_fix)
      .map(r => {
        const dtcs = (r.dtc_codes as string[] | null)?.join(', ');
        return `${r.final_fix as string}${dtcs ? ` (${dtcs})` : ''}`;
      })
      .filter(Boolean)
      .slice(0, 4);
  } catch {
    return [];
  }
}

// ─── Step metadata ─────────────────────────────────────────────────────────────

type Step = 'vehicle' | 'category' | 'questions' | 'tech_notes' | 'summary';

const STEPS: { id: Step; label: string }[] = [
  { id: 'vehicle',    label: 'Vehicle'   },
  { id: 'category',   label: 'Category'  },
  { id: 'questions',  label: 'Symptoms'  },
  { id: 'tech_notes', label: 'Tech Notes'},
  { id: 'summary',    label: 'Summary'   },
];

const engine = new QuestionEngine();

// ─── Default state factories ───────────────────────────────────────────────────

function defaultVehicle(): TriageVehicle {
  return { make: '', model: '', year: '', engine: '', mileage: '', fuelType: '', transmission: '' };
}

function defaultTechNotes(): TechnicianNotes {
  return {
    additionalObservations: '',
    customerRequests:       '',
    urgency:                'routine',
    towIn:                  false,
    vehicleUnsafe:          false,
    waitingCustomer:        false,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TriageView() {
  const dispatch = useAppDispatch();

  const [step,       setStep]       = useState<Step>('vehicle');
  const [vehicle,    setVehicle]    = useState<TriageVehicle>(defaultVehicle());
  const [categoryId, setCategoryId] = useState<CategoryId | null>(null);
  const [answers,    setAnswers]    = useState<AnswerMap>({});
  const [techNotes,  setTechNotes]  = useState<TechnicianNotes>(defaultTechNotes());
  const [session,    setSession]    = useState<TriageSession | null>(null);
  const [insights,   setInsights]   = useState<string[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState<string | null>(null);
  const [history,    setHistory]    = useState<TriageSession[]>([]);
  const [shopId,     setShopId]     = useState<string>('');
  const [startedAt,  setStartedAt]  = useState<number>(Date.now());

  // Load shop + history on mount
  useEffect(() => {
    (async () => {
      const id = await getShopId();
      setShopId(id ?? '');
      const sessions = await listTriageSessions(10);
      setHistory(sessions);
    })();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // Compile session whenever we reach the summary step
  useEffect(() => {
    if (step !== 'summary' || !categoryId || !shopId) return;

    engine.setCategory(categoryId);
    const compiled = engine.compileSession(shopId, vehicle, categoryId, answers, techNotes);
    setSession(compiled);

    fetchKnowledgeInsights(vehicle, categoryId).then(setInsights);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ────────────────────────────────────────────────────────────

  function go(to: Step) {
    if (to === 'questions' && categoryId) engine.setCategory(categoryId);
    setStep(to);
  }

  // ── Save / convert ────────────────────────────────────────────────────────

  const handleSaveDraft = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    const saved = await saveTriageSession({ ...session, status: 'draft' });
    setSaving(false);
    if (saved) {
      setSession(saved);
      showToast('Draft saved');
      const sessions = await listTriageSessions(10);
      setHistory(sessions);
    }
  }, [session]);

  const handleSendToJobCard = useCallback(async () => {
    if (!session) return;
    setSaving(true);

    // Save as complete
    const intakeSeconds = Math.round((Date.now() - startedAt) / 1000);
    const saved = await saveTriageSession({
      ...session,
      status: 'complete',
    });
    setSaving(false);

    if (saved) {
      setSession(saved);
      showToast('Triage saved — opening Job Cards…');
      // Pre-fill the job card create form via the global store dispatch
      dispatch({
        type: 'OPEN_NEW_JOB_CARD',
        prefill: {
          customerName: session.vehicle.customerName ?? '',
          customerId:   session.vehicle.customerId,
          vehicle:      `${session.vehicle.year} ${session.vehicle.make} ${session.vehicle.model}`.trim(),
          notes:        session.complaintSummary,
        },
      });
    }
  }, [session, startedAt, dispatch]);

  const handleSendToInspection = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    try {
      const inspNumber = await nextInspectionNumber();
      const draft = createInspectionFromTriage(session, inspNumber);
      await createInspection(draft);
      await saveTriageSession({ ...session, status: 'complete' });
      showToast('Inspection created — opening Digital Inspections…');
      dispatch({ type: 'SET_MODULE', module: 'inspections' });
    } catch (e) {
      showToast('Failed to create inspection');
    } finally {
      setSaving(false);
    }
  }, [session, dispatch]);

  // ── Reset ──────────────────────────────────────────────────────────────────

  function resetForm() {
    setStep('vehicle');
    setVehicle(defaultVehicle());
    setCategoryId(null);
    setAnswers({});
    setTechNotes(defaultTechNotes());
    setSession(null);
    setInsights([]);
    setStartedAt(Date.now());
  }

  // ── Step index for progress bar ────────────────────────────────────────────

  const stepIndex = STEPS.findIndex(s => s.id === step);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 72, right: 24, zIndex: 9999,
          background: '#1a1a1a', border: '1px solid #333',
          borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>{toast}</div>
      )}

      {/* Info banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 8, padding: '9px 14px', marginBottom: 16, fontSize: 12, color: 'var(--muted)',
      }}>
        <span style={{ fontSize: 15 }}>💡</span>
        <span>
          <strong style={{ color: 'var(--text)' }}>Smart Intake</strong> is also available inside{' '}
          <button
            onClick={() => dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: {} })}
            style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 700, fontSize: 12, padding: 0 }}
          >
            New Job Card
          </button>
          {' '}— guided complaint capture without leaving the job card workflow.
        </span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Vehicle Intake
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Capture complaint before creating a job card
            </p>
          </div>
          {step !== 'vehicle' && (
            <button
              onClick={resetForm}
              style={{
                background: 'transparent', border: '1px solid var(--line)',
                borderRadius: 7, padding: '6px 14px', fontSize: 12,
                cursor: 'pointer', color: 'var(--muted)',
              }}
            >
              ↺ New Triage
            </button>
          )}
        </div>
      </div>

      {/* Step progress */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28 }}>
        {STEPS.map((s, i) => {
          const done    = i < stepIndex;
          const current = i === stepIndex;
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background:   done ? '#22c55e' : current ? '#cc0000' : 'var(--surface-soft)',
                    border:       `2px solid ${done ? '#22c55e' : current ? '#cc0000' : 'var(--line)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                    color: done || current ? '#fff' : 'var(--muted)',
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: current ? 700 : 500,
                    color: current ? 'var(--text)' : 'var(--muted)',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    display: 'none',
                  }}
                    className="step-label"
                  >
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: current ? 'var(--text)' : 'var(--muted)', marginTop: 3, fontWeight: current ? 700 : 400, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {s.label}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  height: 2, flex: 1,
                  background: done ? '#22c55e' : 'var(--line)',
                  margin: '0 6px', marginTop: -18,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Main card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 12, padding: 24, marginBottom: 32,
      }}>
        {step === 'vehicle' && (
          <VehicleStep
            vehicle={vehicle}
            onChange={setVehicle}
            onNext={() => go('category')}
          />
        )}

        {step === 'category' && (
          <CategoryStep
            selected={categoryId}
            onSelect={setCategoryId}
            onNext={() => go('questions')}
            onBack={() => go('vehicle')}
          />
        )}

        {step === 'questions' && categoryId && (
          <QuestionsStep
            categoryId={categoryId}
            answers={answers}
            onChange={setAnswers}
            onNext={() => go('tech_notes')}
            onBack={() => go('category')}
          />
        )}

        {step === 'tech_notes' && (
          <TechNotesStep
            notes={techNotes}
            onChange={setTechNotes}
            onNext={() => go('summary')}
            onBack={() => go('questions')}
          />
        )}

        {step === 'summary' && session && (
          <SummaryStep
            session={session}
            saving={saving}
            onSendToJobCard={handleSendToJobCard}
            onSendToInspection={handleSendToInspection}
            onSaveDraft={handleSaveDraft}
            onBack={() => go('tech_notes')}
            knowledgeInsights={insights}
          />
        )}
      </div>

      {/* Recent triage history */}
      {history.length > 0 && (
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12,
          }}>
            Recent Triage Sessions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(h => {
              const statusColors: Record<string, string> = {
                draft: '#f59e0b', complete: '#22c55e', converted: '#6b7280',
              };
              return (
                <div key={h.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'var(--surface)', border: '1px solid var(--line)',
                  borderRadius: 10, padding: '12px 16px', gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {h.vehicle.year} {h.vehicle.make} {h.vehicle.model}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.complaintSummary || 'No summary'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 20,
                      padding: '2px 9px', textTransform: 'uppercase',
                      background: `${statusColors[h.status]}22`,
                      color: statusColors[h.status],
                      border: `1px solid ${statusColors[h.status]}`,
                    }}>
                      {h.status}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: h.dataQualityScore >= 70 ? '#22c55e' : 'var(--muted)' }}>
                      {h.dataQualityScore}%
                    </span>
                    {h.status !== 'converted' && (
                      <button
                        onClick={async () => {
                          if (!h.id) return;
                          await deleteTriageSession(h.id);
                          setHistory(prev => prev.filter(s => s.id !== h.id));
                        }}
                        style={{
                          background: 'transparent', border: 'none',
                          color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px',
                        }}
                        title="Delete"
                      >×</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
