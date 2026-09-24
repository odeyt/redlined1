import { ImageResponse } from 'next/og';

/**
 * Social preview for /shop-owner-demo, generated at build time.
 *
 * The only other share image in the repo is the 512px app icon, which crops
 * badly in a 1.91:1 link card. This is text and flat shapes only — no product
 * screenshot, so there is nothing in it that could be mistaken for real shop
 * data.
 */
export const alt = 'RedlineD1 — see every vehicle in your shop and what it’s waiting on';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const COLUMNS = [
  { label: 'Pending Approval', fg: '#7e22ce', bg: '#fdf4ff' },
  { label: 'Pending Parts', fg: '#9a3412', bg: '#fff7ed' },
  { label: 'Work In Progress', fg: '#1e40af', bg: '#eff6ff' },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: 72, background: '#0a0a0a', color: '#f5f5f5',
      }}>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>
          <span>Redline</span><span style={{ color: '#ff3b3b' }}>D1</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, maxWidth: 980 }}>
            See every vehicle in your shop — and what it’s waiting on.
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 44 }}>
            {COLUMNS.map(c => (
              <div key={c.label} style={{
                display: 'flex', padding: '12px 22px', borderRadius: 999,
                background: c.bg, color: c.fg, fontSize: 26, fontWeight: 700,
              }}>
                {c.label}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#a3a3a3' }}>
          For independent auto repair shops · redlined1.com
        </div>
      </div>
    ),
    size,
  );
}
