// Supported action types for recommendations.
// Actions are suggestions only — they never automatically modify data.
export const ACTION_TYPES = {
  // Navigate to existing screens
  open_invoice:              'open_invoice',
  open_estimate:             'open_estimate',
  open_job_card:             'open_job_card',
  open_repair_order:         'open_repair_order',
  open_inventory:            'open_inventory',
  open_customer:             'open_customer',
  open_repair_case:          'open_repair_case',
  open_entity:               'open_entity',
  // Placeholder actions (prepare future workflows — no auto-send)
  call_customer_placeholder:         'call_customer_placeholder',
  send_message_placeholder:          'send_message_placeholder',
  create_invoice_placeholder:        'create_invoice_placeholder',
  create_repair_case_placeholder:    'create_repair_case_placeholder',
  // Legacy aliases (kept for backward compat with existing rules)
  call_customer:             'call_customer',
  send_message:              'send_message',
  create_invoice:            'create_invoice',
  create_estimate:           'create_estimate',
  create_repair_case:        'create_repair_case',
  order_parts:               'order_parts',
  review_repair_order:       'review_repair_order',
  review_technician_load:    'review_technician_load',
  send_maintenance_reminder: 'send_maintenance_reminder',
  // Outcome actions
  mark_done:                 'mark_done',
  dismiss:                   'dismiss',
} as const;

export type ActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES];

/** Map an action type to the app module it should navigate to */
export function actionToModule(actionType: string): string | null {
  const map: Record<string, string> = {
    open_invoice:           'invoices',
    open_estimate:          'estimates',
    open_job_card:          'job-cards',
    open_repair_order:      'repair-orders',
    open_inventory:         'parts',
    open_customer:          'customers',
    open_repair_case:       'repair-cases',
    create_invoice:         'invoices',
    create_estimate:        'estimates',
    create_repair_case:     'repair-cases',
    order_parts:            'parts',
    review_repair_order:    'repair-orders',
    review_technician_load: 'technicians',
    send_maintenance_reminder: 'customers',
  };
  return map[actionType] ?? null;
}
