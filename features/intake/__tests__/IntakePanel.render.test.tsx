/**
 * @jest-environment jsdom
 */

/**
 * The "What does this customer need?" panel, RENDERED — each choice does what
 * its label says and nothing more. In particular "Customer record only" and
 * "Book service for later" must never create work, and a parts request must
 * go through with no vehicle.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockDispatch = jest.fn();
jest.mock('@/lib/store', () => ({ useAppDispatch: () => mockDispatch }));
jest.mock('@/lib/useShop', () => ({ useShop: () => ({ currentShop: { id: 'shop-2', name: 'D1 Imports - Location 1' } }) }));

const mockFetchVehicles = jest.fn();
jest.mock('@/services/vehicleService', () => ({
  fetchVehicles: (...a: unknown[]) => mockFetchVehicles(...a),
  saveVehicle: jest.fn(),
}));
jest.mock('@/services/technicianService', () => ({
  fetchTechnicians: async () => [{ id: 't1', name: 'Mike R.' }],
  uniqueTechsByPerson: (t: unknown[]) => t,
}));
jest.mock('@/services/shopSettingsService', () => ({
  fetchShopSettings: async () => ({ defaultCurrency: 'USD' }),
  SHOP_PRICING_DEFAULTS: { currency: 'USD' },
}));

const mockStartServiceVisit = jest.fn();
const mockCreatePartsInquiry = jest.fn();
jest.mock('@/services/intakeService', () => ({
  startServiceVisit: (...a: unknown[]) => mockStartServiceVisit(...a),
  createPartsInquiry: (...a: unknown[]) => mockCreatePartsInquiry(...a),
}));

import { IntakePanel } from '../IntakePanel';
import type { Customer } from '@/lib/types';

const customer: Customer = {
  id: 'cust-1', name: 'Luey Hyundai', type: 'Retail', phone: '020 1234', email: '',
  address: '', tags: [], followUp: '', portalToken: null,
} as Customer;
const vehicle = { id: 'veh-1', customerId: 'cust-1', label: '2018 Hyundai Tucson', plate: '8860', vin: '', trim: '', engine: '', transmission: '', mileage: '', status: 'Active', recommendation: '' };

beforeEach(() => {
  mockDispatch.mockReset();
  mockFetchVehicles.mockReset().mockResolvedValue([vehicle]);
  mockStartServiceVisit.mockReset();
  mockCreatePartsInquiry.mockReset().mockResolvedValue({ estimate: { id: 'pe-1' }, reused: false });
});

function renderPanel(onClose = jest.fn()) {
  render(<IntakePanel customer={customer} context="customer" onClose={onClose} />);
  return onClose;
}

it('asks what the customer needs, with the four choices', () => {
  renderPanel();
  expect(screen.getByRole('dialog', { name: 'What does this customer need?' })).toBeTruthy();
  for (const label of ['Vehicle here for service', 'Book service for later', 'Parts inquiry or order', 'Customer record only']) {
    expect(screen.getByText(label)).toBeTruthy();
  }
});

it('"Customer record only" creates nothing and closes', () => {
  const onClose = renderPanel();
  fireEvent.click(screen.getByText('Customer record only'));

  expect(mockStartServiceVisit).not.toHaveBeenCalled();
  expect(mockCreatePartsInquiry).not.toHaveBeenCalled();
  expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'NOTIFY' }));
  expect(onClose).toHaveBeenCalled();
});

it('"Book service for later" opens the appointment form for this customer and opens no repair order', () => {
  renderPanel();
  fireEvent.click(screen.getByText('Book service for later'));

  expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_PREFILL', prefill: expect.objectContaining({ customerId: 'cust-1', customerName: 'Luey Hyundai' }) });
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_MODULE', module: 'appointments' });
  expect(mockStartServiceVisit).not.toHaveBeenCalled();
});

it('"Vehicle here for service" validates, then opens the visit with the customer and vehicle, and offers the RO', async () => {
  mockStartServiceVisit.mockResolvedValue({ kind: 'created', jobCardId: 'JC-1', roNumber: 'RO-00012', reused: false, needsTechnician: true, warnings: [] });
  renderPanel();
  fireEvent.click(screen.getByText('Vehicle here for service'));

  // The only vehicle is preselected once loaded.
  await waitFor(() => expect((screen.getByLabelText('Vehicle') as HTMLSelectElement).value).toBe('veh-1'));

  // No concern yet: refused, nothing created.
  fireEvent.click(screen.getByRole('button', { name: 'Check in & open repair order' }));
  expect(await screen.findByText(/Describe the concern/)).toBeTruthy();
  expect(mockStartServiceVisit).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Concern'), { target: { value: 'A/C not cold' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check in & open repair order' }));

  await waitFor(() => expect(mockStartServiceVisit).toHaveBeenCalledTimes(1));
  expect(mockStartServiceVisit).toHaveBeenCalledWith(expect.objectContaining({
    customerId: 'cust-1', customerName: 'Luey Hyundai', vehicleId: 'veh-1', vehicleLabel: '2018 Hyundai Tucson',
    concern: 'A/C not cold', technician: '', allowSeparateVisit: false,
  }));
  expect(await screen.findByRole('button', { name: 'Open RO-00012 & assign technician' })).toBeTruthy();
});

it('shows an existing active order and only makes a separate visit when asked', async () => {
  mockStartServiceVisit
    .mockResolvedValueOnce({ kind: 'active_order_exists', orders: [{ id: 'ro-11', roNumber: 'RO-00011', status: 'In Progress', concern: 'AC/HEAT', vehicle: '2018 Hyundai Tucson' }] })
    .mockResolvedValueOnce({ kind: 'created', jobCardId: 'JC-2', roNumber: 'RO-00013', reused: false, needsTechnician: true, warnings: [] });
  renderPanel();
  fireEvent.click(screen.getByText('Vehicle here for service'));
  await waitFor(() => expect((screen.getByLabelText('Vehicle') as HTMLSelectElement).value).toBe('veh-1'));
  fireEvent.change(screen.getByLabelText('Concern'), { target: { value: 'Brake noise' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check in & open repair order' }));

  expect(await screen.findByText('RO-00011')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start a separate visit' }));

  await waitFor(() => expect(mockStartServiceVisit).toHaveBeenCalledTimes(2));
  // Same request id both times: the second press is the same intake, not a new one.
  const [first, second] = mockStartServiceVisit.mock.calls.map(c => c[0]);
  expect(second.requestId).toBe(first.requestId);
  expect(second.allowSeparateVisit).toBe(true);
});

it('a parts request goes through with no vehicle and opens no repair order', async () => {
  renderPanel();
  fireEvent.click(screen.getByText('Parts inquiry or order'));
  await waitFor(() => expect(mockFetchVehicles).toHaveBeenCalled());

  fireEvent.change(screen.getByLabelText('Part requested'), { target: { value: 'Front brake pads' } });
  fireEvent.click(screen.getByLabelText('This came through a referral'));
  fireEvent.change(screen.getByLabelText('Referred by'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save parts request' }));

  await waitFor(() => expect(mockCreatePartsInquiry).toHaveBeenCalledTimes(1));
  expect(mockCreatePartsInquiry).toHaveBeenCalledWith(expect.objectContaining({
    customerId: 'cust-1', vehicleLabel: '', partRequested: 'Front brake pads',
    contactPhone: '020 1234', referral: true, referredBy: 'Sam', currency: 'USD',
  }));
  expect(mockStartServiceVisit).not.toHaveBeenCalled();
  expect(await screen.findByRole('button', { name: 'Open Parts Quotations' })).toBeTruthy();
});
