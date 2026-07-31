'use client';

import { PRIORITY_CURRENCIES, OTHER_CURRENCIES, currencySymbol } from '@/lib/currencies';

/**
 * Currency picker. A native <select> with optgroups rather than a custom
 * dropdown: it is searchable by typing on every platform, works with the
 * on-screen keyboard on mobile, and needs no focus-trap handling.
 */
export function CurrencySelect({
  value,
  onChange,
  id,
  style,
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  style?: React.CSSProperties;
}) {
  return (
    <select
      id={id}
      className="input"
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label="Currency"
      style={{ width: '100%', ...style }}
    >
      <optgroup label="Frequently used">
        {PRIORITY_CURRENCIES.map(c => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name} ({currencySymbol(c.code)})
          </option>
        ))}
      </optgroup>
      <optgroup label="All currencies">
        {OTHER_CURRENCIES.map(c => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
