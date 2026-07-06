/**
 * Automotive Triage Engine — AI Context Builder
 * Part 13: Future AI Hook
 *
 * Produces a fully structured JSON object describing the triage session.
 * Does NOT call any AI. The future AI Service Advisor will consume this.
 *
 * When AI is enabled, pass this context to the LLM prompt as structured input.
 */

import { TriageSession } from './QuestionTypes';

export interface TriageAIContext {
  version: '1.0';
  sessionId?: string;
  shopId: string;

  vehicle: {
    make: string;
    model: string;
    year: string;
    engine: string;
    mileage: number | null;
    fuelType: string;
    transmission: string;
  };

  complaint: {
    categoryId: string;
    complaintSummary: string;
    answers: Record<string, unknown>;
  };

  inspectionPlan: {
    suggestedChecks: string[];
  };

  technician: {
    additionalObservations: string;
    customerRequests: string;
    urgency: string;
    flags: {
      towIn: boolean;
      vehicleUnsafe: boolean;
      waitingCustomer: boolean;
    };
  };

  quality: {
    score: number;
  };

  meta: {
    generatedAt: string;
    mode: 'mock' | 'knowledge_graph' | 'ai';
    aiReady: boolean;
  };
}

export function buildTriageContext(session: TriageSession): TriageAIContext {
  return {
    version: '1.0',
    sessionId: session.id,
    shopId: session.shopId,

    vehicle: {
      make:         session.vehicle.make,
      model:        session.vehicle.model,
      year:         session.vehicle.year,
      engine:       session.vehicle.engine,
      mileage:      session.vehicle.mileage ? Number(session.vehicle.mileage) : null,
      fuelType:     session.vehicle.fuelType,
      transmission: session.vehicle.transmission,
    },

    complaint: {
      categoryId:       session.categoryId ?? 'unknown',
      complaintSummary: session.complaintSummary,
      answers:          session.answers,
    },

    inspectionPlan: {
      suggestedChecks: session.inspectionSuggestions,
    },

    technician: {
      additionalObservations: session.techNotes.additionalObservations,
      customerRequests:       session.techNotes.customerRequests,
      urgency:                session.techNotes.urgency,
      flags: {
        towIn:          session.techNotes.towIn,
        vehicleUnsafe:  session.techNotes.vehicleUnsafe,
        waitingCustomer: session.techNotes.waitingCustomer,
      },
    },

    quality: {
      score: session.dataQualityScore,
    },

    meta: {
      generatedAt: new Date().toISOString(),
      mode: 'mock',       // change to 'knowledge_graph' or 'ai' as features are enabled
      aiReady: false,     // flip to true when AI Service Advisor is live
    },
  };
}
