'use client';

/**
 * The first thing on the dashboard: the handful of modules this role actually
 * uses, as large tap targets, customisable.
 *
 * Renders from local data with no fetch, so the landing screen is useful
 * before any widget below it finishes loading — the reason it exists is that
 * the dashboard was a tall black expanse on a phone until the widgets
 * arrived.
 *
 * On customisation: HTML5 drag-and-drop does not fire on touch. dragstart
 * simply never happens on a phone, so a drag-only implementation would work
 * on a desktop and do nothing on the device this is for. Both are provided:
 * drag to reorder with a mouse, and explicit move/remove/add controls that
 * work with a thumb. The controls are not a fallback — on a phone they are
 * the primary interface, and they are also the only accessible route from a
 * keyboard.
 */
import { useEffect, useState } from 'react';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import { navItems } from '@/lib/mock-data';
import { Icon, iconColors } from '@/components/Icon';
import {
  MAX_QUICK_ACTIONS, availableModules, loadQuickActions, saveQuickActions,
  resetQuickActions, reorder,
} from '@/lib/quickActions';

export function RoleQuickActions() {
  const { role, loading } = useShop();
  const dispatch = useAppDispatch();

  const [ids, setIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  // Loaded in an effect, not in useState's initialiser: localStorage is not
  // available during server rendering, and reading it there would make the
  // first client render disagree with the server's.
  useEffect(() => {
    if (!role) return;
    setIds(loadQuickActions(role));
  }, [role]);

  if (loading || !role) return null;

  const meta = new Map(navItems.map(([id, icon, label]) => [id, { icon, label }]));
  const available = availableModules(role).filter(([id]) => !ids.includes(id));

  function commit(next: string[]) {
    setIds(next);
    saveQuickActions(role, next);
  }

  const tileStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 8, minHeight: 88, padding: '14px 8px',
    borderRadius: 14, border: '1px solid var(--line, rgba(255,255,255,0.10))',
    background: 'var(--card, rgba(255,255,255,0.04))', color: 'var(--text)',
    cursor: 'pointer', textAlign: 'center', position: 'relative',
  };

  return (
    <section aria-label="Quick actions" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          {editing ? `Shortcuts — ${ids.length} of ${MAX_QUICK_ACTIONS}` : 'Shortcuts'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing && (
            <button
              type="button"
              onClick={() => { resetQuickActions(role); setIds(loadQuickActions(role)); }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(e => !e)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {editing ? 'Done' : 'Customise'}
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
        gap: 10,
      }}>
        {ids.map((id, i) => {
          const m = meta.get(id);
          if (!m) return null;
          const color = iconColors[id] || '#9eb2c2';
          return (
            <div
              key={id}
              // Desktop reordering. Harmless on touch, where these never fire.
              draggable={editing}
              onDragStart={() => setDragFrom(i)}
              onDragOver={e => { if (editing) e.preventDefault(); }}
              onDrop={() => {
                if (dragFrom !== null) commit(reorder(ids, dragFrom, i));
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              style={{
                ...tileStyle,
                cursor: editing ? 'grab' : 'pointer',
                opacity: dragFrom === i ? 0.5 : 1,
                borderStyle: editing ? 'dashed' : 'solid',
              }}
              onClick={() => { if (!editing) dispatch({ type: 'SET_MODULE', module: id }); }}
            >
              <Icon name={m.icon} style={{ color }} />
              <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{m.label}</span>

              {editing && (
                // Thumb-reachable equivalents of dragging. Also the only way
                // to reorder from a keyboard.
                <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                  <button type="button" aria-label={`Move ${m.label} left`} disabled={i === 0}
                    onClick={ev => { ev.stopPropagation(); commit(reorder(ids, i, i - 1)); }}
                    style={miniBtn(i === 0)}>←</button>
                  <button type="button" aria-label={`Remove ${m.label}`}
                    onClick={ev => { ev.stopPropagation(); commit(ids.filter(x => x !== id)); }}
                    style={miniBtn(false)}>✕</button>
                  <button type="button" aria-label={`Move ${m.label} right`} disabled={i === ids.length - 1}
                    onClick={ev => { ev.stopPropagation(); commit(reorder(ids, i, i + 1)); }}
                    style={miniBtn(i === ids.length - 1)}>→</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <div style={{ marginTop: 12 }}>
          {ids.length >= MAX_QUICK_ACTIONS ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              All {MAX_QUICK_ACTIONS} slots are full — remove one to add another.
            </p>
          ) : available.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              Every module you can open is already a shortcut.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
                Tap to add a shortcut:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {available.map(([id, icon, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => commit([...ids, id])}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      minHeight: 44, padding: '8px 12px', borderRadius: 10,
                      border: '1px dashed var(--line, rgba(255,255,255,0.14))',
                      background: 'transparent', color: 'var(--text)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Icon name={icon} style={{ color: iconColors[id] || '#9eb2c2' }} />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function miniBtn(disabled: boolean): React.CSSProperties {
  return {
    // 28px rather than 44: these sit inside an 88px tile and three of them
    // must fit across it. Spaced apart so the destructive one is not adjacent
    // to a mis-tap.
    minWidth: 28, minHeight: 28,
    borderRadius: 8,
    border: '1px solid var(--line, rgba(255,255,255,0.14))',
    background: 'var(--surface, rgba(255,255,255,0.06))',
    color: disabled ? 'var(--muted)' : 'var(--text)',
    fontSize: 12, lineHeight: 1,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };
}
