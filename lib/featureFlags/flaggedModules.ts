/**
 * Modules that exist only while their feature flag is on.
 *
 * One rule, read by both AppShell (which closes the route) and Sidebar (which
 * hides the link). Hiding the link alone is not enough: SET_MODULE can be
 * dispatched from a tile, a widget or a saved state. While flags are still
 * loading they read as off, so a flagged module never flashes open for a shop
 * that does not have it.
 */
export interface ModuleFlags {
  internalReminders: boolean;
  redlineAi: boolean;
}

export function flagBlockedModules(flags: ModuleFlags): string[] {
  const blocked: string[] = [];
  if (!flags.internalReminders) blocked.push('reminders');
  if (!flags.redlineAi) blocked.push('redline-ai');
  return blocked;
}
