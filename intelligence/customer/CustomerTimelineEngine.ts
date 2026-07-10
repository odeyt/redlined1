// SI-13: Customer Timeline Engine

import type { CustomerLifetimeContext, CustomerTimelineItem } from './types';

export function buildCustomerTimeline(ctx: CustomerLifetimeContext): CustomerTimelineItem[] {
  const items: CustomerTimelineItem[] = [];

  for (const job of ctx.jobHistory) {
    items.push({
      id: `job_${job.id}`,
      eventType: 'job_card',
      eventDate: job.completedAt ?? job.createdAt,
      title: job.status === 'completed' ? 'Service completed' : 'Service job',
      summary: job.status ? `Status: ${job.status}` : null,
      amount: null,
      sourceEntityType: 'job_card',
      sourceEntityId: job.id,
    });
  }

  for (const estimate of ctx.estimateHistory) {
    let title = 'Estimate created';
    let eventDate = estimate.createdAt;
    if (estimate.approvedAt) {
      title = 'Estimate approved';
      eventDate = estimate.approvedAt;
    } else if (estimate.declinedAt) {
      title = 'Estimate declined';
      eventDate = estimate.declinedAt;
    }
    items.push({
      id: `estimate_${estimate.id}`,
      eventType: 'estimate',
      eventDate,
      title,
      summary: estimate.status ?? null,
      amount: estimate.totalAmount,
      sourceEntityType: 'estimate',
      sourceEntityId: estimate.id,
    });
  }

  for (const invoice of ctx.invoiceHistory) {
    items.push({
      id: `invoice_${invoice.id}`,
      eventType: 'invoice',
      eventDate: invoice.paidAt ?? invoice.createdAt,
      title: invoice.paidAt ? 'Invoice paid' : 'Invoice created',
      summary: invoice.status ?? null,
      amount: invoice.totalAmount,
      sourceEntityType: 'invoice',
      sourceEntityId: invoice.id,
    });
  }

  for (const appt of ctx.appointmentHistory) {
    items.push({
      id: `appt_${appt.id}`,
      eventType: 'appointment',
      eventDate: appt.scheduledAt ?? appt.createdAt,
      title: 'Appointment',
      summary: appt.status ?? null,
      amount: null,
      sourceEntityType: 'appointment',
      sourceEntityId: appt.id,
    });
  }

  for (const declined of ctx.declinedWork) {
    items.push({
      id: `declined_${declined.id}`,
      eventType: 'declined_work',
      eventDate: declined.declinedAt ?? new Date().toISOString(),
      title: 'Work declined',
      summary: declined.description,
      amount: declined.estimatedValue,
      sourceEntityType: 'estimate_declined_item',
      sourceEntityId: declined.id,
    });
  }

  // Sort descending by date
  items.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

  return items.slice(0, 100);
}
