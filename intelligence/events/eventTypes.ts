// 17 canonical Intelligence event type constants
export const EVENT_TYPES = {
  CustomerCreated: 'CustomerCreated',
  VehicleCreated: 'VehicleCreated',
  JobCardCreated: 'JobCardCreated',
  EstimateCreated: 'EstimateCreated',
  EstimateApproved: 'EstimateApproved',
  EstimateDeclined: 'EstimateDeclined',
  RepairOrderCompleted: 'RepairOrderCompleted',
  InvoiceCreated: 'InvoiceCreated',
  InvoicePaid: 'InvoicePaid',
  PaymentRecorded: 'PaymentRecorded',
  InventoryLow: 'InventoryLow',
  InventoryUpdated: 'InventoryUpdated',
  RepairCaseCreated: 'RepairCaseCreated',
  TechnicianClockIn: 'TechnicianClockIn',
  TechnicianClockOut: 'TechnicianClockOut',
  FeatureFlagChanged: 'FeatureFlagChanged',
  SubscriptionChanged: 'SubscriptionChanged',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
