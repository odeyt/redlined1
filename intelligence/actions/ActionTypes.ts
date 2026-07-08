// Supported action types for recommendations.
// Actions are suggestions only — they never automatically modify data.
export const ACTION_TYPES = {
  call_customer:            'call_customer',
  send_message:             'send_message',
  create_invoice:           'create_invoice',
  create_estimate:          'create_estimate',
  create_repair_case:       'create_repair_case',
  order_parts:              'order_parts',
  review_repair_order:      'review_repair_order',
  review_technician_load:   'review_technician_load',
  send_maintenance_reminder:'send_maintenance_reminder',
  open_entity:              'open_entity',
  dismiss:                  'dismiss',
} as const;

export type ActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES];
