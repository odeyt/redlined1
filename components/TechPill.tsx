'use client';
import { techPillStyle, parseTechNames } from '@/lib/techColors';

export function TechPill({ name }: { name: string }) {
  return <span style={techPillStyle(name)}>{name}</span>;
}

/** Renders all techs from a comma-separated string as colored pills */
export function TechPills({ value, gap = 4 }: { value: string; gap?: number }) {
  const names = parseTechNames(value);
  if (!names.length) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap }}>
      {names.map(n => <TechPill key={n} name={n} />)}
    </div>
  );
}
