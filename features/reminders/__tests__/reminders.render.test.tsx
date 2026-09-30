/**
 * @jest-environment jsdom
 */

/**
 * The reminder screens, RENDERED: tabs and counts, the states a person can
 * land in (loading, empty, error), the actions, the dialog's choices for
 * staff versus managers and per plan, and the flag switching all of it off.
 *
 * The service layer is mocked — the database rules are exercised against real
 * Postgres by tests/db/run-reminders-db-tests.mjs. The clock is pinned to
 * local noon so "today" cannot straddle midnight while the suite runs.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const dispatch = jest.fn();
jest.mock('@/lib/store', () => ({ useAppDispatch: () => dispatch }));

const flags: Record<string, boolean> = {};
jest.mock('@/components/featureFlags/FeatureFlagProvider', () => ({
  useFeatureFlag: (key: string) => flags[key] ?? false,
}));

const service = {
  fetchReminders: jest.fn(),
  fetchReminderLinkLabels: jest.fn(),
  fetchReminderHistory: jest.fn(),
  completeReminder: jest.fn(),
  reopenReminder: jest.fn(),
  cancelReminder: jest.fn(),
  createReminder: jest.fn(),
  updateReminder: jest.fn(),
};
jest.mock('@/services/reminderService', () => ({
  ...service,
  ReminderError: jest.requireActual('@/lib/domain/reminders').ReminderError,
}));

const ME = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const COLLEAGUE = '1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

type Setup = import('../useReminderSetup').ReminderSetup;
let setup: Setup;
jest.mock('../useReminderSetup', () => ({ useReminderSetup: () => setup }));

import { RemindersView } from '../RemindersView';
import { ReminderFormDialog } from '../ReminderFormDialog';
import { AddReminderButton } from '../AddReminderButton';
import { RemindersDueWidget } from '@/features/dashboard/widgets/catalog/RemindersDueWidget';
import { ReminderError } from '@/lib/domain/reminders';

const NOON = new Date(2026, 5, 10, 12, 0, 0); // local noon, whatever the machine's timezone
const hours = (h: number) => new Date(NOON.getTime() + h * 3_600_000).toISOString();

function reminder(over: Record<string, unknown> = {}) {
  return {
    id: String(Math.random()), shopId: 's', title: 'Call supplier', notes: null, dueAt: hours(2),
    priority: 'normal', status: 'open', assignedTo: ME, customerId: null, vehicleId: null, jobCardId: null,
    createdBy: ME, completedBy: null, completedAt: null, createdAt: hours(-48), updatedAt: hours(-48),
    ...over,
  };
}

function makeSetup(over: Partial<Setup> = {}): Setup {
  return {
    loading: false, userId: ME, role: 'technician', isManager: false,
    entitlements: { tier: 'team', maxOpen: null, canAssignToOthers: true },
    members: [
      { userId: ME, email: 'me@shop.test', role: 'technician' },
      { userId: COLLEAGUE, email: 'khamla@shop.test', role: 'technician' },
    ],
    nameFor: (id: string | null) => (!id ? 'Unassigned' : id === ME ? 'You' : 'khamla'),
    ...over,
  };
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOON, doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.clearAllMocks();
  for (const k of Object.keys(flags)) delete flags[k];
  setup = makeSetup();
  service.fetchReminderLinkLabels.mockResolvedValue({});
  service.fetchReminderHistory.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

function mockLists(open: unknown[], closed: unknown[] = []) {
  service.fetchReminders.mockImplementation((o: { state: string }) => Promise.resolve(o.state === 'open' ? open : closed));
}

describe('RemindersView', () => {
  it('shows a loading state, then groups by when things are due', async () => {
    mockLists([
      reminder({ title: 'Chase approval', dueAt: hours(-3) }),
      reminder({ title: 'Re-torque wheels', dueAt: hours(3) }),
      reminder({ title: 'Order filters', dueAt: hours(72) }),
    ]);
    render(<RemindersView />);
    expect(screen.getByText('Loading reminders…')).toBeTruthy();

    await screen.findByText('Chase approval');
    expect(screen.getByRole('tab', { name: 'Overdue (1)' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Due today (1)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Upcoming (1)' })).toBeTruthy();
    expect(screen.queryByText('Re-torque wheels')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Due today (1)' }));
    expect(screen.getByText('Re-torque wheels')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Upcoming (1)' }));
    expect(screen.getByText('Order filters')).toBeTruthy();
  });

  it('opens on the first group that has something in it', async () => {
    mockLists([reminder({ title: 'Later', dueAt: hours(72) })]);
    render(<RemindersView />);
    await screen.findByText('Later');
    expect(screen.getByRole('tab', { name: 'Upcoming (1)' }).getAttribute('aria-selected')).toBe('true');
  });

  it('says what state a reminder is in with words, not only colour', async () => {
    mockLists([reminder({ title: 'Chase approval', dueAt: hours(-3), priority: 'high' })]);
    render(<RemindersView />);
    const item = (await screen.findByText('Chase approval')).closest('li')!;
    expect(within(item).getByText('Overdue')).toBeTruthy();
    expect(within(item).getByText(/High priority/)).toBeTruthy();
    expect(within(item).getByText(/You/)).toBeTruthy();
  });

  it('has an empty state per group', async () => {
    mockLists([]);
    render(<RemindersView />);
    expect(await screen.findByText('Nothing overdue. Nice work.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Completed/ }));
    expect(screen.getByText(/Completed and cancelled reminders will appear here/)).toBeTruthy();
  });

  it('shows a retryable error when loading fails', async () => {
    service.fetchReminders.mockRejectedValueOnce(new Error('Network down')).mockResolvedValue([]);
    render(<RemindersView />);
    expect((await screen.findByRole('alert')).textContent).toContain('Network down');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('marks a reminder done and reloads', async () => {
    const r = reminder({ title: 'Chase approval', dueAt: hours(-3) });
    mockLists([r]);
    service.completeReminder.mockResolvedValue({ ...r, status: 'completed' });
    render(<RemindersView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark "Chase approval" done' }));
    await waitFor(() => expect(service.completeReminder).toHaveBeenCalledWith(r.id));
    expect(await screen.findByText('Marked done.')).toBeTruthy();
  });

  it('offers plans only when a reopen is refused by the plan', async () => {
    const r = reminder({ title: 'Old job', status: 'completed', completedAt: hours(-1) });
    mockLists([], [r]);
    service.reopenReminder.mockRejectedValue(new ReminderError('Free Forever keeps up to 3 open reminders at a time.', { kind: 'limit', limit: 3 }));
    render(<RemindersView />);
    fireEvent.click(screen.getByRole('tab', { name: /^Completed/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen "Old job"' }));
    expect((await screen.findByRole('alert')).textContent).toContain('3 open reminders');
    fireEvent.click(screen.getByRole('button', { name: 'See plans' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_MODULE', module: 'subscriptions' });
  });

  it('offers "Only mine" to managers and not to staff', async () => {
    mockLists([]);
    const { unmount } = render(<RemindersView />);
    await screen.findByText('Nothing overdue. Nice work.');
    expect(screen.queryByLabelText('Only mine')).toBeNull();
    unmount();

    setup = makeSetup({ role: 'manager', isManager: true });
    mockLists([
      reminder({ title: 'Mine', dueAt: hours(-1) }),
      reminder({ title: 'Theirs', dueAt: hours(-1), assignedTo: COLLEAGUE, createdBy: COLLEAGUE }),
    ]);
    render(<RemindersView />);
    await screen.findByText('Theirs');
    fireEvent.click(screen.getByLabelText('Only mine'));
    expect(screen.queryByText('Theirs')).toBeNull();
    expect(screen.getByText('Mine')).toBeTruthy();
  });

  it('shows the history of a reminder', async () => {
    const r = reminder({ title: 'Chase approval', dueAt: hours(-3) });
    mockLists([r]);
    service.fetchReminderHistory.mockResolvedValue([
      { id: 'e1', reminderId: r.id, action: 'created', fromStatus: null, toStatus: 'open', changedFields: [], assignedTo: ME, actorId: ME, createdAt: hours(-48) },
      { id: 'e2', reminderId: r.id, action: 'assigned', fromStatus: 'open', toStatus: 'open', changedFields: ['assigned_to'], assignedTo: COLLEAGUE, actorId: ME, createdAt: hours(-24) },
    ]);
    render(<RemindersView />);
    const item = (await screen.findByText('Chase approval')).closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'History' }));
    expect(await within(item).findByText(/Created by You/)).toBeTruthy();
    expect(within(item).getByText(/Reassigned to khamla by You/)).toBeTruthy();
  });
});

describe('ReminderFormDialog', () => {
  const noop = () => {};

  it('focuses the title and explains a missing one', () => {
    render(<ReminderFormDialog setup={setup} onClose={noop} onSaved={noop} />);
    const title = screen.getByLabelText('What needs doing?');
    expect(document.activeElement).toBe(title);
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    expect(screen.getByRole('alert').textContent).toContain('Give the reminder a title');
    expect(service.createReminder).not.toHaveBeenCalled();
  });

  it('staff can assign only to themselves', () => {
    render(<ReminderFormDialog setup={setup} onClose={noop} onSaved={noop} />);
    const options = within(screen.getByLabelText('Who is doing it?')).getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['Unassigned', 'Me']);
  });

  it('a manager on a team plan can pick a colleague', () => {
    setup = makeSetup({ role: 'manager', isManager: true });
    render(<ReminderFormDialog setup={setup} onClose={noop} onSaved={noop} />);
    const options = within(screen.getByLabelText('Who is doing it?')).getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['Unassigned', 'Me', 'khamla (technician)']);
  });

  it('a manager on Solo sees why the team is not offered', () => {
    setup = makeSetup({ role: 'owner', isManager: true, entitlements: { tier: 'solo', maxOpen: null, canAssignToOthers: false } });
    render(<ReminderFormDialog setup={setup} onClose={noop} onSaved={noop} />);
    const options = within(screen.getByLabelText('Who is doing it?')).getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['Unassigned', 'Me']);
    expect(screen.getByText(/Assigning to your team is part of Starter and above/)).toBeTruthy();
  });

  it('creates with the linked record, a stable id, and an instant for the due time', async () => {
    const onSaved = jest.fn();
    service.createReminder.mockResolvedValue(reminder());
    render(
      <ReminderFormDialog setup={setup} onClose={noop} onSaved={onSaved}
        preset={{ link: { kind: 'job_card', id: 'JC-1737158234567' }, label: 'JC-1737158234567' }} />,
    );
    expect(screen.getByText('JC-1737158234567')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('What needs doing?'), { target: { value: 'Road test after brake job' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const sent = service.createReminder.mock.calls[0][0];
    expect(sent).toMatchObject({ title: 'Road test after brake job', jobCardId: 'JC-1737158234567', customerId: null, vehicleId: null, assignedTo: ME, priority: 'normal' });
    expect(sent.dueAt).toMatch(/Z$/);
    expect(typeof sent.id).toBe('string');
  });

  it('a retry after a failure reuses the same id, so it cannot create twice', async () => {
    service.createReminder
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(reminder());
    render(<ReminderFormDialog setup={setup} onClose={noop} onSaved={noop} />);
    fireEvent.change(screen.getByLabelText('What needs doing?'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await waitFor(() => expect(service.createReminder).toHaveBeenCalledTimes(2));
    expect(service.createReminder.mock.calls[0][0].id).toBe(service.createReminder.mock.calls[1][0].id);
  });

  it('offers plans on the Free Forever cap, and not on an ordinary error', async () => {
    service.createReminder.mockRejectedValueOnce(new ReminderError('Free Forever keeps up to 3 open reminders at a time.', { kind: 'limit', limit: 3 }));
    render(<ReminderFormDialog setup={setup} onClose={noop} onSaved={noop} />);
    fireEvent.change(screen.getByLabelText('What needs doing?'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'See plans' })).toBeTruthy();

    service.createReminder.mockRejectedValueOnce(new ReminderError('That customer could not be found in this shop.', { kind: 'link_invalid', entity: 'customer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be found'));
    expect(screen.queryByRole('button', { name: 'See plans' })).toBeNull();
  });

  it('editing keeps an assignee the current plan could no longer choose', () => {
    setup = makeSetup({ role: 'manager', isManager: true, entitlements: { tier: 'free', maxOpen: 3, canAssignToOthers: false }, members: [] });
    render(<ReminderFormDialog setup={setup} onClose={noop} onSaved={noop}
      reminder={reminder({ assignedTo: COLLEAGUE }) as never} />);
    const select = screen.getByLabelText('Who is doing it?') as HTMLSelectElement;
    expect(select.value).toBe(COLLEAGUE);
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(<ReminderFormDialog setup={setup} onClose={onClose} onSaved={noop} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('feature flag', () => {
  it('"Add reminder" renders nothing while the flag is off', () => {
    const { container } = render(<AddReminderButton link={{ kind: 'customer', id: 'C-1' }} label="Somchai" />);
    expect(container.innerHTML).toBe('');
  });

  it('"Add reminder" opens the dialog for its record when the flag is on', () => {
    flags.internal_reminders = true;
    render(<AddReminderButton link={{ kind: 'customer', id: 'C-1' }} label="Somchai" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder for Somchai' }));
    expect(screen.getByRole('dialog', { name: 'New reminder' })).toBeTruthy();
    expect(screen.getByText('Somchai')).toBeTruthy();
  });

  it('the widget loads nothing while the flag is off', () => {
    render(<RemindersDueWidget onNav={() => {}} />);
    expect(screen.getByText('Reminders are not turned on for this shop.')).toBeTruthy();
    expect(service.fetchReminders).not.toHaveBeenCalled();
  });

  it('the widget shows real counts when on', async () => {
    flags.internal_reminders = true;
    service.fetchReminders.mockResolvedValue([
      reminder({ dueAt: hours(-2) }), reminder({ dueAt: hours(-5) }), reminder({ dueAt: hours(1) }), reminder({ dueAt: hours(80) }),
    ]);
    const onNav = jest.fn();
    render(<RemindersDueWidget onNav={onNav} />);
    const summary = await screen.findByRole('button', { name: '2 overdue and 1 due today. Open reminders.' });
    fireEvent.click(summary);
    expect(onNav).toHaveBeenCalledWith('reminders');
  });
});
