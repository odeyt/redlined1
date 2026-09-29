/**
 * Compatibility wrapper for the reminders domain.
 *
 * Same shape as the other wrappers: build a context from the browser's shop
 * store, delegate. Nothing here talks to Supabase directly.
 */
import { browserDeps } from '@/lib/domain/browserAdapter';
import {
  createReminderDomain, ReminderError,
  type Reminder, type ReminderEvent, type ReminderLink, type ReminderListOptions,
  type ReminderCreateInput, type ReminderUpdateInput, type ReminderStatus, type ReminderPriority,
} from '@/lib/domain/reminders';
import type { ReminderTier } from '@/lib/reminders/entitlements';

export type {
  Reminder, ReminderEvent, ReminderLink, ReminderListOptions,
  ReminderCreateInput, ReminderUpdateInput, ReminderStatus, ReminderPriority, ReminderTier,
};
export { ReminderError };

async function domain() {
  return createReminderDomain(await browserDeps());
}

export async function fetchReminders(options: ReminderListOptions = {}): Promise<Reminder[]> {
  return (await domain()).list(options);
}

export async function createReminder(input: ReminderCreateInput): Promise<Reminder> {
  return (await domain()).create(input);
}

export async function updateReminder(id: string, patch: ReminderUpdateInput): Promise<Reminder> {
  return (await domain()).update(id, patch);
}

export async function completeReminder(id: string): Promise<Reminder> {
  return (await domain()).complete(id);
}

export async function reopenReminder(id: string): Promise<Reminder> {
  return (await domain()).reopen(id);
}

export async function cancelReminder(id: string): Promise<Reminder> {
  return (await domain()).cancel(id);
}

export async function fetchReminderHistory(id: string): Promise<ReminderEvent[]> {
  return (await domain()).history(id);
}

export async function fetchReminderLinkLabels(reminders: readonly Reminder[]): Promise<Record<string, string>> {
  return (await domain()).linkLabels(reminders);
}

export async function fetchReminderTier(shopId?: string): Promise<ReminderTier | null> {
  return (await domain()).tier(shopId);
}
