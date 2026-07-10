# AI Philosophy

This document defines how RedlineD1 builds and deploys AI.

Every engineer, every session, every feature must follow these principles.
They are not guidelines. They are constraints.

---

## Core Principles

### AI assists. It does not decide.

AI surfaces information, suggests actions, and ranks priorities.
Humans approve, reject, or ignore those suggestions.
No AI feature in RedlineD1 may take an irreversible action without human confirmation.

### AI explains. It never hides reasoning.

Every recommendation must cite its source data.
Every signal must identify what triggered it.
Every score must describe what contributed to it.
Black-box outputs are not acceptable in RedlineD1.

If the system cannot explain why it made a recommendation, the recommendation should not be surfaced.

### AI improves with evidence.

The system gets smarter as more repairs are completed, more estimates are approved or declined, and more outcomes are recorded.

AI must learn from the data it generates — not from models trained elsewhere.
Every completed repair is a training signal.
Every approved recommendation is a validation.
Every comeback is a correction.

### AI never silently changes data.

No AI feature may modify a job card, invoice, estimate, customer record, or vehicle record without explicit user action.

No AI feature may send an SMS, email, or notification automatically.

No AI feature may create, close, or update a work order automatically.

These constraints are permanent. Not defaults. Not flags. Permanent.

### Humans approve important actions.

The action queue presents ranked priorities.
The human decides what to act on.
The AI advises. The human confirms.

This is not a limitation of the platform.
This is a feature. Technicians and owners trust tools that stay in their lane.

### All recommendations must be explainable.

The Evidence Engine (SI-4) exists for this reason.
Every recommendation in the system must carry:
- A confidence score
- A source reference (which data produced this)
- A reasoning summary (why this was surfaced now)

Recommendations without evidence are noise. RedlineD1 does not produce noise.

---

## What RedlineD1 Will Never Build

- AI that autonomously modifies customer or vehicle data
- AI that sends communications without human review
- AI that makes billing or payment decisions
- AI that blocks a workflow when it fails
- AI that requires an external provider to function (all providers are optional enhancements)
- Embeddings or vector search as a core dependency
- Any feature that makes the platform fragile when AI is unavailable

---

## Provider Independence

RedlineD1 uses a provider abstraction layer for all external AI.

The `IntelligenceProvider` interface is implemented by any external provider (e.g. Sapelee).

RedlineD1 must function at full operational capacity with zero external AI providers active.

External AI enhances the platform. It never becomes a dependency.

This is enforced architecturally — not by policy.

---

## The Trust Contract

RedlineD1 earns trust by:

1. Always explaining what it did and why
2. Never acting without confirmation on important operations
3. Being wrong transparently (low confidence score) rather than confidently wrong
4. Improving visibly over time as the shop's data grows
5. Never being slower or less reliable because of AI features

The moment AI makes RedlineD1 feel unreliable or opaque, trust is lost.
That is the primary risk. Every architecture decision must guard against it.
