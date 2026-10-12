/**
 * @jest-environment jsdom
 */

/**
 * The tax box must accept 6.35. The input it replaces redisplayed "6." as "6"
 * the moment the point was typed, so the next digits ran on to 635.
 */
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DecimalInput } from '../DecimalInput';

function Harness({ max, onValue }: { max?: number; onValue: (n: number) => void }) {
  const [v, setV] = useState(0);
  return <DecimalInput aria-label="tax" value={v} max={max} onValueChange={n => { setV(n); onValue(n); }} />;
}

function typeChars(input: HTMLInputElement, text: string) {
  let acc = '';
  for (const ch of text) {
    acc = input.value + ch;
    fireEvent.change(input, { target: { value: acc } });
  }
}

describe('DecimalInput', () => {
  it('lets 6.35 be typed one key at a time', () => {
    const seen: number[] = [];
    render(<Harness max={100} onValue={n => seen.push(n)} />);
    const input = screen.getByLabelText('tax') as HTMLInputElement;
    typeChars(input, '6.35');
    expect(input.value).toBe('6.35');
    expect(seen[seen.length - 1]).toBe(6.35);
  });

  it('clamps to the maximum', () => {
    const seen: number[] = [];
    render(<Harness max={100} onValue={n => seen.push(n)} />);
    const input = screen.getByLabelText('tax') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '635' } });
    expect(seen[seen.length - 1]).toBe(100);
    expect(input.value).toBe('100');
  });

  it('follows a value set from outside', () => {
    const { rerender } = render(<DecimalInput aria-label="tax" value={0} onValueChange={() => {}} />);
    rerender(<DecimalInput aria-label="tax" value={6.35} onValueChange={() => {}} />);
    expect((screen.getByLabelText('tax') as HTMLInputElement).value).toBe('6.35');
  });
});
