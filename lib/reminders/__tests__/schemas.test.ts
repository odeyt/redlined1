/**
 * Reminder input validation: malformed ids, bad dates, oversized text,
 * invented priorities and statuses — refused before a request is made, with
 * the same limits the database enforces.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ReminderCreateSchema, ReminderUpdateSchema, ReminderStatusSchema, ReminderIdSchema,
  REMINDER_TITLE_MAX, REMINDER_NOTES_MAX,
} from '../schemas';

const SHOP = '5a0c1e2d-3b4f-4a6c-8d7e-9f0a1b2c3d4e';
const USER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const VEHICLE = '0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b';
const base = { title: 'Call supplier', dueAt: '2026-10-01T09:00:00.000Z' };

const ok = (input: unknown) => ReminderCreateSchema.safeParse(input).success;

describe('ReminderCreateSchema', () => {
  it('accepts a minimal reminder and fills the defaults', () => {
    const parsed = ReminderCreateSchema.parse(base);
    expect(parsed).toMatchObject({ title: 'Call supplier', priority: 'normal', notes: null, assignedTo: null, customerId: null, vehicleId: null, jobCardId: null });
  });

  it('accepts every link with real id shapes', () => {
    expect(ok({ ...base, assignedTo: USER, customerId: 'CUST-17', vehicleId: VEHICLE, jobCardId: 'JC-1737158234567' })).toBe(true);
  });

  it('refuses a shopId: the shop is always the caller\'s active one, never the request\'s', () => {
    expect(ok({ ...base, shopId: SHOP })).toBe(false);
  });

  it('trims the title, and refuses a blank or oversized one', () => {
    expect(ReminderCreateSchema.parse({ ...base, title: '  Re-torque  ' }).title).toBe('Re-torque');
    expect(ok({ ...base, title: '   ' })).toBe(false);
    expect(ok({ ...base, title: 'x'.repeat(REMINDER_TITLE_MAX) })).toBe(true);
    expect(ok({ ...base, title: 'x'.repeat(REMINDER_TITLE_MAX + 1) })).toBe(false);
  });

  it('refuses oversized notes and stores blank notes as null', () => {
    expect(ok({ ...base, notes: 'n'.repeat(REMINDER_NOTES_MAX) })).toBe(true);
    expect(ok({ ...base, notes: 'n'.repeat(REMINDER_NOTES_MAX + 1) })).toBe(false);
    expect(ReminderCreateSchema.parse({ ...base, notes: '   ' }).notes).toBeNull();
  });

  it('refuses a due time that is missing, malformed, or has no offset', () => {
    expect(ok({ title: 'x' })).toBe(false);
    expect(ok({ ...base, dueAt: 'next tuesday' })).toBe(false);
    expect(ok({ ...base, dueAt: '2026-10-01T09:00' })).toBe(false);          // bare local time: whose 09:00?
    expect(ok({ ...base, dueAt: '2026-02-30T09:00:00Z' })).toBe(false);
    expect(ok({ ...base, dueAt: '2026-10-01T09:00:00+07:00' })).toBe(true);
  });

  it('refuses an invented priority', () => {
    expect(ok({ ...base, priority: 'urgent' })).toBe(false);
    for (const p of ['low', 'normal', 'high']) expect(ok({ ...base, priority: p })).toBe(true);
  });

  it('refuses malformed ids', () => {
    expect(ok({ ...base, assignedTo: 'not-a-uuid' })).toBe(false);
    expect(ok({ ...base, vehicleId: 'VIN123' })).toBe(false);
    expect(ok({ ...base, customerId: "x' OR 1=1 --" })).toBe(false);
    expect(ok({ ...base, jobCardId: '../../etc/passwd' })).toBe(false);
    expect(ok({ ...base, id: '123' })).toBe(false);
  });

  it('refuses fields the client has no business setting', () => {
    expect(ok({ ...base, status: 'completed' })).toBe(false);
    expect(ok({ ...base, createdBy: USER })).toBe(false);
    expect(ok({ ...base, completedAt: '2000-01-01T00:00:00Z' })).toBe(false);
  });
});

describe('ReminderUpdateSchema', () => {
  it('accepts a partial edit and clearing links', () => {
    expect(ReminderUpdateSchema.safeParse({ priority: 'high', customerId: null }).success).toBe(true);
  });
  it('refuses status and shop changes through edit', () => {
    expect(ReminderUpdateSchema.safeParse({ status: 'completed' }).success).toBe(false);
    expect(ReminderUpdateSchema.safeParse({ shopId: SHOP }).success).toBe(false);
  });
});

describe('status and id', () => {
  it('knows only open, completed and cancelled', () => {
    for (const s of ['open', 'completed', 'cancelled']) expect(ReminderStatusSchema.safeParse(s).success).toBe(true);
    for (const s of ['sent', 'contacted', 'confirmed', 'done', '']) expect(ReminderStatusSchema.safeParse(s).success).toBe(false);
  });
  it('reminder ids are uuids', () => {
    expect(ReminderIdSchema.safeParse(USER).success).toBe(true);
    expect(ReminderIdSchema.safeParse('1; drop table').success).toBe(false);
  });
});

describe('the limits match the database', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/2026-09-29_internal_reminders.sql'), 'utf8');
  it('title', () => expect(sql).toContain(`char_length(btrim(title)) BETWEEN 1 AND ${REMINDER_TITLE_MAX}`));
  it('notes', () => expect(sql).toContain(`char_length(notes) <= ${REMINDER_NOTES_MAX}`));
  it('priority', () => expect(sql).toContain(`priority IN ('low', 'normal', 'high')`));
  it('status', () => expect(sql).toContain(`status IN ('open', 'completed', 'cancelled')`));
});
