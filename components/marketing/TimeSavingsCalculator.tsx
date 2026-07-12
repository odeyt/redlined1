'use client';

import { useId, useMemo, useState } from 'react';
import { colors, container, h2Style, card, disclaimer } from './theme';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function NumberField({ label, value, onChange, min = 0, max = 1000, step = 1 }: NumberFieldProps) {
  const id = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label htmlFor={id} style={{ fontSize: '13px', fontWeight: 500, color: colors.textMain }}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        style={{
          minHeight: '44px',
          padding: '10px 12px',
          fontSize: '15px',
          border: `1px solid ${colors.borderLight}`,
          borderRadius: '6px',
          color: colors.textMain,
          background: colors.surfaceWhite,
        }}
      />
    </div>
  );
}

/**
 * TimeSavingsCalculator - interactive, client-side, no network call.
 * Formulas documented verbatim in LANDING_PAGE_MASTER_SPEC.md Section 7.1.
 * Conservative defaults per mission Part 8.
 */
export function TimeSavingsCalculator() {
  const [technicians, setTechnicians] = useState(2);
  const [jobsPerDay, setJobsPerDay] = useState(8);
  const [minutesPerJob, setMinutesPerJob] = useState(3);
  const [daysPerWeek, setDaysPerWeek] = useState(5);
  const [weeksPerYear, setWeeksPerYear] = useState(48);

  const result = useMemo(() => {
    const dailyMinutesSaved = technicians * jobsPerDay * minutesPerJob;
    const weeklyHoursSaved = (dailyMinutesSaved * daysPerWeek) / 60;
    const monthlyHoursSaved = weeklyHoursSaved * (weeksPerYear / 12);
    const annualHoursSaved = weeklyHoursSaved * weeksPerYear;
    const equivalentWorkDays = annualHoursSaved / 8;
    return { dailyMinutesSaved, weeklyHoursSaved, monthlyHoursSaved, annualHoursSaved, equivalentWorkDays };
  }, [technicians, jobsPerDay, minutesPerJob, daysPerWeek, weeksPerYear]);

  return (
    <section id="time-savings-calculator" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '32px' }}>
          <h2 style={h2Style}>How much time could your shop save?</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            Adjust the numbers below to match your shop. The math updates instantly and is shown in full.
          </p>
        </div>

        <div className="rd1-two-col">
          <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <NumberField label="Technicians" value={technicians} onChange={setTechnicians} max={100} />
            <NumberField label="Jobs completed per technician per day" value={jobsPerDay} onChange={setJobsPerDay} max={50} />
            <NumberField label="Minutes saved per job" value={minutesPerJob} onChange={setMinutesPerJob} max={120} />
            <NumberField label="Working days per week" value={daysPerWeek} onChange={setDaysPerWeek} max={7} />
            <div style={{ gridColumn: '1 / -1' }}>
              <NumberField label="Working weeks per year" value={weeksPerYear} onChange={setWeeksPerYear} max={52} />
            </div>
          </div>

          <div style={{ ...card, background: colors.surfaceDark, borderColor: colors.borderDark }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <Stat label="Daily minutes saved" value={result.dailyMinutesSaved.toFixed(0)} />
              <Stat label="Weekly hours saved" value={result.weeklyHoursSaved.toFixed(1)} />
              <Stat label="Monthly hours saved" value={result.monthlyHoursSaved.toFixed(1)} />
              <Stat label="Annual hours saved" value={result.annualHoursSaved.toFixed(0)} />
            </div>
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${colors.borderDark}` }}>
              <Stat label="Equivalent 8-hour working days per year" value={result.equivalentWorkDays.toFixed(1)} large />
            </div>
            <p style={{ marginTop: '20px', fontSize: '12px', color: 'rgba(250,250,250,0.6)', fontFamily: 'monospace' }}>
              daily minutes = technicians x jobs/day x minutes/job
            </p>
          </div>
        </div>

        <p style={{ ...disclaimer, marginTop: '20px' }}>
          Illustrative estimate only. Actual results depend on shop workflow, staffing, usage, and data quality.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(250,250,250,0.6)' }}>
        {label}
      </div>
      <div style={{ fontSize: large ? '32px' : '24px', fontWeight: 600, color: colors.textOnDark, marginTop: '4px' }}>
        {value}
      </div>
    </div>
  );
}
