import { mergeLayoutWithRegistry } from '../layoutMerge';
import type { WidgetDefinition, WidgetLayoutItem } from '../types';

function widget(id: string, w = 4, h = 3): WidgetDefinition {
  return {
    id,
    title: id,
    category: 'operational',
    component: () => null,
    defaultSize: { w, h },
    minSize: { w: 2, h: 2 },
    allowedRoles: null,
  };
}

describe('mergeLayoutWithRegistry', () => {
  it('keeps saved layout unchanged when every widget is still available and nothing new exists', () => {
    const saved: WidgetLayoutItem[] = [{ i: 'a', x: 0, y: 0, w: 4, h: 3 }];
    const result = mergeLayoutWithRegistry(saved, [widget('a')]);
    expect(result).toEqual(saved);
  });

  it('drops saved entries for widgets no longer available', () => {
    const saved: WidgetLayoutItem[] = [
      { i: 'a', x: 0, y: 0, w: 4, h: 3 },
      { i: 'removed', x: 4, y: 0, w: 4, h: 3 },
    ];
    const result = mergeLayoutWithRegistry(saved, [widget('a')]);
    expect(result.map(i => i.i)).toEqual(['a']);
  });

  it('appends newly-available widgets below existing ones', () => {
    const saved: WidgetLayoutItem[] = [{ i: 'a', x: 0, y: 0, w: 4, h: 3 }];
    const result = mergeLayoutWithRegistry(saved, [widget('a'), widget('b')]);
    expect(result).toHaveLength(2);
    const appended = result.find(i => i.i === 'b')!;
    expect(appended.y).toBeGreaterThanOrEqual(3); // below 'a' which ends at y=3
  });

  it('wraps to a new row when appended widgets would exceed 12 columns', () => {
    const result = mergeLayoutWithRegistry([], [widget('a', 8), widget('b', 8)]);
    const [a, b] = result;
    expect(a.x).toBe(0);
    expect(b.x).toBe(0); // wrapped, since 8 + 8 > 12
    expect(b.y).toBeGreaterThan(a.y);
  });

  it('returns an empty layout when nothing is saved and nothing is available', () => {
    expect(mergeLayoutWithRegistry([], [])).toEqual([]);
  });
});
