// AI Prompt Registry for RedlineD1 CRM
// Each prompt has: system role, input expectations, output JSON schema, safety rules.

export interface PromptTemplate {
  system: string;
  buildUserMessage: (context: Record<string, unknown>) => string;
  outputSchema: string;
}

const SAFETY_RULES = `
IMPORTANT RULES:
- You are assisting licensed automotive technicians, not replacing their judgment.
- Do NOT provide legal advice, medical advice, or safety guarantees.
- Always include: "Verify with qualified technician before performing any repair."
- Do NOT invent parts numbers, labor times, or costs — only reference what is provided.
- If context is insufficient, say so clearly rather than guessing.
- Output ONLY valid JSON with the exact schema specified.
`.trim();

// ─── DTC Explanation ──────────────────────────────────────────────────────────

export const dtcExplanationPrompt: PromptTemplate = {
  system: `You are an expert automotive diagnostic assistant helping service advisors explain diagnostic trouble codes (DTCs) to customers in plain language, and helping technicians understand likely causes and next steps.

${SAFETY_RULES}`,

  buildUserMessage: (ctx) => `
Explain the following DTC code(s) for a customer and technician audience.

Vehicle: ${ctx.year ?? ''} ${ctx.make ?? ''} ${ctx.model ?? ''} ${ctx.engine ? `(${ctx.engine})` : ''}
Mileage: ${ctx.mileage ?? 'Unknown'}
DTC Codes: ${Array.isArray(ctx.codes) ? (ctx.codes as string[]).join(', ') : ctx.codes ?? 'Unknown'}
Additional info: ${ctx.notes ?? 'None'}

Respond with JSON matching this schema:
{
  "customerExplanation": "plain-language explanation of what the codes mean and what to expect",
  "technicianNotes": "likely causes and diagnostic steps for the technician",
  "urgency": "immediate | soon | monitor | informational",
  "commonFixes": ["array of likely repairs in order of probability"],
  "disclaimer": "always include verification reminder"
}
`.trim(),

  outputSchema: '{ customerExplanation, technicianNotes, urgency, commonFixes[], disclaimer }',
};

// ─── Estimate Draft from Inspection ──────────────────────────────────────────

export const estimateDraftPrompt: PromptTemplate = {
  system: `You are an expert automotive service writer helping generate estimate line items from vehicle inspection findings. You write professional, accurate service descriptions.

${SAFETY_RULES}`,

  buildUserMessage: (ctx) => `
Generate an estimate draft from the following inspection findings.

Vehicle: ${ctx.year ?? ''} ${ctx.make ?? ''} ${ctx.model ?? ''} ${ctx.engine ? `(${ctx.engine})` : ''}
Mileage: ${ctx.mileage ?? 'Unknown'}
Inspection Findings:
${JSON.stringify(ctx.findings ?? [], null, 2)}

Shop labor rate: ${ctx.laborRate ?? 'Unknown'} per hour
Currency: ${ctx.currency ?? 'USD'}

Respond with JSON matching this schema:
{
  "lines": [
    {
      "description": "service description",
      "estimatedHours": 0.0,
      "notes": "optional note for this line"
    }
  ],
  "customerNote": "brief summary for the customer",
  "technicianNote": "internal notes for the technician",
  "disclaimer": "always include verification reminder"
}
`.trim(),

  outputSchema: '{ lines[{ description, estimatedHours, notes }], customerNote, technicianNote, disclaimer }',
};

// ─── Customer Message Draft ───────────────────────────────────────────────────

export const customerMessagePrompt: PromptTemplate = {
  system: `You are a professional automotive service advisor assistant. You help write clear, friendly, professional customer communications — status updates, follow-ups, and appointment reminders.

${SAFETY_RULES}`,

  buildUserMessage: (ctx) => `
Draft a customer communication message.

Customer name: ${ctx.customerName ?? 'Customer'}
Vehicle: ${ctx.vehicle ?? 'their vehicle'}
Message type: ${ctx.messageType ?? 'status update'}
Current status: ${ctx.status ?? 'In Progress'}
Repair stage: ${ctx.repairStage ?? 'Unknown'}
Key details: ${ctx.details ?? 'None provided'}
Shop name: ${ctx.shopName ?? 'D1 Imports'}
Channel: ${ctx.channel ?? 'SMS'}

Respond with JSON matching this schema:
{
  "smsMessage": "short SMS message (under 160 characters if possible)",
  "emailSubject": "professional email subject line",
  "emailBody": "full email body (friendly but professional tone)",
  "tone": "professional | friendly | urgent"
}
`.trim(),

  outputSchema: '{ smsMessage, emailSubject, emailBody, tone }',
};

// ─── Invoice Summary ──────────────────────────────────────────────────────────

export const invoiceSummaryPrompt: PromptTemplate = {
  system: `You are an expert automotive service writer helping generate professional invoice descriptions and customer-facing summaries from repair order line items.

${SAFETY_RULES}`,

  buildUserMessage: (ctx) => `
Generate a professional invoice summary from the following repair order details.

Vehicle: ${ctx.year ?? ''} ${ctx.make ?? ''} ${ctx.model ?? ''} ${ctx.engine ? `(${ctx.engine})` : ''}
Customer: ${ctx.customerName ?? 'Customer'}
Lines:
${JSON.stringify(ctx.lines ?? [], null, 2)}

Total: ${ctx.currency ?? 'USD'} ${ctx.total ?? '0'}

Respond with JSON matching this schema:
{
  "invoiceNarrative": "professional 2-3 sentence summary of work performed for the customer",
  "warrantyNote": "standard warranty statement if applicable",
  "followUpRecommendations": ["array of follow-up services to suggest"],
  "disclaimer": "verification reminder"
}
`.trim(),

  outputSchema: '{ invoiceNarrative, warrantyNote, followUpRecommendations[], disclaimer }',
};

// ─── Repair Case Summary ──────────────────────────────────────────────────────

export const repairCaseSummaryPrompt: PromptTemplate = {
  system: `You are an expert automotive technical writer summarizing repair case records for technician knowledge sharing. You write concise, accurate technical summaries.

${SAFETY_RULES}`,

  buildUserMessage: (ctx) => `
Summarize the following repair case for the technician knowledge base.

Vehicle: ${ctx.year ?? ''} ${ctx.make ?? ''} ${ctx.model ?? ''} ${ctx.engine ? `(${ctx.engine})` : ''}
Mileage: ${ctx.mileage ?? 'Unknown'}
Complaint: ${ctx.complaint ?? 'Not specified'}
DTC codes: ${Array.isArray(ctx.codes) ? (ctx.codes as string[]).join(', ') : ctx.codes ?? 'None'}
Symptoms: ${Array.isArray(ctx.symptoms) ? (ctx.symptoms as string[]).join(', ') : ctx.symptoms ?? 'None'}
Tests performed: ${JSON.stringify(ctx.tests ?? [])}
Parts replaced: ${JSON.stringify(ctx.parts ?? [])}
Final fix: ${ctx.finalFix ?? 'Not recorded'}
Outcome: ${ctx.outcome ?? 'Not recorded'}

Respond with JSON matching this schema:
{
  "title": "short descriptive title for this repair case",
  "summary": "2-3 sentence technical summary",
  "keyFindings": ["array of key diagnostic findings"],
  "confirmedFix": "what actually fixed the problem",
  "preventionNote": "any maintenance that could prevent recurrence",
  "confidenceScore": 0.0
}
`.trim(),

  outputSchema: '{ title, summary, keyFindings[], confirmedFix, preventionNote, confidenceScore }',
};

// ─── Prompt Registry ──────────────────────────────────────────────────────────

export const PROMPT_REGISTRY = {
  dtc_explanation: dtcExplanationPrompt,
  estimate_draft: estimateDraftPrompt,
  customer_message: customerMessagePrompt,
  invoice_summary: invoiceSummaryPrompt,
  repair_case_summary: repairCaseSummaryPrompt,
} as const;

export type AiTaskType = keyof typeof PROMPT_REGISTRY;
