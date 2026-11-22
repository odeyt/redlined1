/**
 * Redline AI — job orchestration.
 *
 * Each job: run the deterministic queries, build the deterministic answer,
 * then (only when configured) let the LLM rephrase it or draft the message.
 * Any LLM failure leaves the deterministic answer untouched — see llm.ts.
 * Drafts are returned as text for staff to copy; nothing is ever sent.
 */
import {
  buildMorningBriefAnswer,
  buildStaleEstimatesAnswer,
  buildVehicleHistoryAnswer,
  buildWhoOwesAnswer,
  draftEstimateFollowUp,
  draftInvoiceFollowUp,
} from './answers';
import { draftWithLlm, llmConfigured, rephraseAnswer } from './llm';
import {
  fetchAwaitingEstimates,
  fetchEstimateById,
  fetchOpenJobs,
  fetchOwed,
  fetchShopName,
  fetchVehicleHistory,
  scopeFor,
  searchVehicles,
  type RedlineDb,
} from './queries';
import type { FollowUpDraft, RedlineAiAnswer, RedlineAiJob } from './types';

export interface RedlineAiRequest {
  job: RedlineAiJob;
  vehicleId?: string;
  vehicleQuery?: string;
  draftKind?: 'estimate' | 'invoice';
  draftId?: string;
}

export class RedlineAiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function maybeRephrase(answer: string): Promise<{ answer: string; llmUsed: boolean }> {
  if (!llmConfigured()) return { answer, llmUsed: false };
  const polished = await rephraseAnswer(answer);
  return polished ? { answer: polished, llmUsed: true } : { answer, llmUsed: false };
}

export async function runRedlineAiJob(
  db: RedlineDb,
  shopId: string,
  req: RedlineAiRequest,
  today: string,
): Promise<RedlineAiAnswer> {
  const scope = await scopeFor(db, shopId);

  switch (req.job) {
    case 'morning_brief': {
      const [openJobs, awaitingEstimates, owedGroups] = await Promise.all([
        fetchOpenJobs(db, scope, today),
        fetchAwaitingEstimates(db, scope, today),
        fetchOwed(db, scope, today),
      ]);
      const facts = { openJobs, awaitingEstimates, owedGroups };
      const deterministic = buildMorningBriefAnswer(facts, today);
      const { answer, llmUsed } = await maybeRephrase(deterministic);
      return { job: req.job, answer, llmUsed, data: { ...facts } };
    }

    case 'stale_estimates': {
      const awaiting = await fetchAwaitingEstimates(db, scope, today);
      const deterministic = buildStaleEstimatesAnswer(awaiting);
      const { answer, llmUsed } = await maybeRephrase(deterministic);
      return { job: req.job, answer, llmUsed, data: { estimates: awaiting } };
    }

    case 'who_owes': {
      const groups = await fetchOwed(db, scope, today);
      const deterministic = buildWhoOwesAnswer(groups);
      const { answer, llmUsed } = await maybeRephrase(deterministic);
      return { job: req.job, answer, llmUsed, data: { customers: groups } };
    }

    case 'vehicle_search': {
      const vehicles = await searchVehicles(db, scope, req.vehicleQuery ?? '');
      return {
        job: req.job,
        answer: vehicles.length
          ? `Found ${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} in your shop. Pick one to see its history.`
          : 'No vehicles in your shop match that search.',
        llmUsed: false,
        data: { vehicles },
      };
    }

    case 'vehicle_history': {
      if (!req.vehicleId) throw new RedlineAiError(400, 'vehicleId is required');
      const history = await fetchVehicleHistory(db, scope, req.vehicleId, today);
      if (!history) throw new RedlineAiError(404, 'That vehicle is not in your shop.');
      const deterministic = buildVehicleHistoryAnswer(history);
      const { answer, llmUsed } = await maybeRephrase(deterministic);
      return {
        job: req.job,
        answer,
        llmUsed,
        data: {
          vehicle: history.vehicle,
          events: history.events,
          declinedEstimates: history.declinedEstimates,
        },
      };
    }

    case 'draft_follow_up': {
      const draft = await buildDraft(db, scope, shopId, req, today);
      return {
        job: req.job,
        answer: draft.draft,
        llmUsed: draft.llmUsed,
        data: { draft },
      };
    }

    default:
      throw new RedlineAiError(400, `Unknown job: ${String((req as { job: unknown }).job)}`);
  }
}

async function buildDraft(
  db: RedlineDb,
  scope: string[],
  shopId: string,
  req: RedlineAiRequest,
  today: string,
): Promise<FollowUpDraft> {
  if (!req.draftKind || !req.draftId) {
    throw new RedlineAiError(400, 'draftKind and draftId are required');
  }
  const shopName = await fetchShopName(db, shopId);

  if (req.draftKind === 'estimate') {
    const estimate = await fetchEstimateById(db, scope, req.draftId, today);
    if (!estimate) throw new RedlineAiError(404, 'That estimate is not in your shop.');
    const facts = {
      kind: 'estimate follow-up',
      shopName,
      customerName: estimate.customerName,
      estimateNumber: estimate.number,
      total: estimate.total,
      currency: estimate.currency,
      vehicle: estimate.vehicleLabel,
      sentDate: estimate.sentAt ?? estimate.createdAt,
      ageDays: estimate.ageDays,
    };
    const llmDraft = await draftWithLlm(facts);
    return {
      kind: 'estimate',
      reference: estimate.number,
      customerName: estimate.customerName,
      draft: llmDraft ?? draftEstimateFollowUp(estimate, shopName),
      llmUsed: !!llmDraft,
    };
  }

  // Invoice drafts are drafted against the outstanding balance, so the
  // record must still be owed — a settled invoice has nothing to follow up.
  const groups = await fetchOwed(db, scope, today);
  const invoice = groups
    .flatMap(g => g.invoices)
    .find(i => i.invoiceNumber === req.draftId);
  if (!invoice) {
    throw new RedlineAiError(404, 'No unpaid invoice with that number in your shop.');
  }
  const facts = {
    kind: 'invoice payment reminder',
    shopName,
    customerName: invoice.customerName,
    invoiceNumber: invoice.invoiceNumber,
    balance: invoice.balance,
    total: invoice.total,
    paid: invoice.paid,
    currency: invoice.currency,
    vehicle: invoice.vehicleLabel,
    dueDate: invoice.dueDate,
    daysOverdue: invoice.daysOverdue,
  };
  const llmDraft = await draftWithLlm(facts);
  return {
    kind: 'invoice',
    reference: invoice.invoiceNumber,
    customerName: invoice.customerName,
    draft: llmDraft ?? draftInvoiceFollowUp(invoice, shopName),
    llmUsed: !!llmDraft,
  };
}
