'use client';
import { useEffect, useState, type InputHTMLAttributes } from 'react';

/**
 * A text box for a decimal number that lets you type the decimal point.
 *
 * The pattern it replaces — value={String(n)} with onChange parsing straight
 * back to a number — drops the "." the moment it is typed ("6." parses to 6
 * and redisplays as "6"), so 6.35 could not be entered at all. This keeps the
 * text as typed and reports the parsed number.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'max' | 'min'> & {
  value: number;
  onValueChange: (n: number) => void;
  max?: number;
};

/** Digits and a single decimal point. */
export function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  return dot === -1 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
}

const show = (n: number) => (n ? String(n) : '');

export function DecimalInput({ value, onValueChange, max, ...rest }: Props) {
  const [text, setText] = useState(show(value));

  // Follow outside changes (a form reset, a default applied) without
  // clobbering what is being typed: "6." and 6 are the same number.
  useEffect(() => {
    setText(t => ((parseFloat(t) || 0) === value ? t : show(value)));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={e => {
        const raw = sanitizeDecimal(e.target.value);
        let n = parseFloat(raw) || 0;
        if (max !== undefined && n > max) {
          n = max;
          setText(show(n));
        } else {
          setText(raw);
        }
        onValueChange(n);
      }}
    />
  );
}
