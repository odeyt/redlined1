import type { WidgetDefinition, WidgetLayoutItem } from './types';

/**
 * Merge a user's saved layout with the current (role/flag-filtered) set of
 * available widgets: drop entries for widgets no longer available, and
 * auto-place any newly-available registry widgets the user hasn't seen yet
 * (e.g. shipped after they last customized their layout) below the rest.
 * Pure function — no I/O, safe to unit test.
 */
export function mergeLayoutWithRegistry(
  savedLayout: WidgetLayoutItem[],
  availableWidgets: WidgetDefinition[]
): WidgetLayoutItem[] {
  const availableIds = new Set(availableWidgets.map(w => w.id));
  const validSaved = savedLayout.filter(item => availableIds.has(item.i));

  const savedIds = new Set(validSaved.map(item => item.i));
  const newWidgets = availableWidgets.filter(w => !savedIds.has(w.id));
  if (newWidgets.length === 0) return validSaved;

  let cursorX = 0;
  let cursorY = validSaved.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  const appended: WidgetLayoutItem[] = [];
  for (const w of newWidgets) {
    if (cursorX + w.defaultSize.w > 12) {
      cursorX = 0;
      cursorY += w.defaultSize.h;
    }
    appended.push({ i: w.id, x: cursorX, y: cursorY, w: w.defaultSize.w, h: w.defaultSize.h });
    cursorX += w.defaultSize.w;
  }

  return [...validSaved, ...appended];
}
