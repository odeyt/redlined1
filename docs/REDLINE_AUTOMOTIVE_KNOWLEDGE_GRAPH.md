# RedlineD1 — Automotive Knowledge Graph
## Architecture & Design Document
### Sprint 4 — Foundation Layer

---

## 1. Purpose

The Automotive Knowledge Graph (AKG) is the long-term intelligence foundation of RedlineD1. It transforms raw repair case records into a structured, queryable network of automotive knowledge: how vehicles fail, how technicians diagnose them, which parts fix which problems, and what patterns emerge across hundreds of real-world repairs.

The graph does not replace the CRM. It sits beneath it — learning from every repair, enriching every future job, and eventually enabling AI features that no generic LLM can match because they will be grounded in real shop data.

---

## 2. Why This Graph Is RedlineD1's Long-Term Moat

Generic AI tools (ChatGPT, Gemini, etc.) know textbook automotive knowledge. They do not know:

- That a 2019 Ford Raptor in Southeast Asia running diesel tends to misfire on cylinder 4 after 80,000 km
- That the first technician to see a P0299 on a Land Cruiser LC300 should check the boost pressure sensor before touching the turbo
- That Technician KAT consistently resolves ECU-related issues on Toyota platforms faster than the shop average
- That a specific DTC on a particular engine family always correlates with a second failure six months later

This proprietary knowledge — captured, normalized, and connected — is the moat. No competitor can replicate it without the same repair history. The graph is how RedlineD1 converts daily shop work into compounding intelligence.

---

## 3. Difference Between CRM Records, Repair Cases, Knowledge Graph Nodes, and Knowledge Graph Edges

### CRM Records
Operational data. Customer name, vehicle VIN, invoice amount, appointment time. These answer: *what happened, when, to whom, and what did it cost?*

### Repair Cases
Structured diagnostic memory. A Repair Case captures the full diagnostic story: DTC codes, symptoms observed, tests performed, parts replaced, final fix, outcome, lesson learned. These answer: *how was this problem solved?*

### Knowledge Graph Nodes
Canonical entities extracted and normalized from repair cases. A node is a named thing: a manufacturer, a DTC code, a symptom, a repair procedure. Each node exists once in the graph regardless of how many repair cases reference it. These answer: *what exists?*

### Knowledge Graph Edges
Relationships between nodes, weighted by evidence. An edge says: "Engine P0299 HAS_SYMPTOM low boost pressure, confirmed by 7 repair cases with confidence 0.91." These answer: *how do things relate, and how strongly?*

---

## 4. Supported Use Cases

### 4.1 Similar Repairs
When a technician opens a new job with DTC P0299 on a 2019 Land Cruiser, the graph surfaces: "We have seen this 4 times. 3 were fixed by replacing the boost pressure sensor. 1 required turbo rebuild." Confidence scores and outcome history are shown.

### 4.2 AI Second Opinion
When a repair order is submitted, the graph provides structured context (not raw text) to an AI model: which DTCs were present, which symptoms are historically correlated, which tests are recommended, which parts have the highest fix rate. The AI uses this graph context as grounded knowledge rather than guessing from training data.

### 4.3 Technician Coaching
The graph tracks which technicians are strong at which platforms and failure types. It surfaces learning signals: "KAT has handled 8 Toyota ECU jobs and all were first-time fixes. BECK has had 2 comebacks on P0299 — recommend pairing with KAT on next similar case."

### 4.4 Comeback Analysis
The graph tracks FIXED_BY → HAS_COMEBACK edges. When a vehicle returns with the same DTC within 90 days, the edge weight on the original repair procedure decreases. Repeat comebacks identify mis-diagnosis patterns and unreliable repair procedures.

### 4.5 Predictive Diagnostics
Based on make, model, engine, and mileage, the graph can surface: "Vehicles like this one commonly develop symptom X at this mileage range. You may want to proactively inspect Y." This is built from COMMON_ON and LEADS_TO edges with frequency weights.

### 4.6 Repair Confidence Scoring
Each repair procedure node has a confidence score derived from: number of cases that used it, comeback rate, technician agreement (did multiple techs independently reach the same fix?), and time-to-resolution. This score is shown to technicians as a signal, not a directive.

### 4.7 Future Marketplace Insights
Aggregated, anonymized graph data reveals which parts are most commonly replaced per platform across the network. This informs parts procurement, supplier relationships, and inventory optimization. Never exposes shop-specific or customer-specific data.

---

## 5. Graph Object Model

```
[Manufacturer] --HAS_MODEL--> [Model]
     |
     └--HAS_PLATFORM--> [Platform]

[Model] --HAS_ENGINE--> [Engine]
         --HAS_TRANSMISSION--> [Transmission]
         --USES_ECU--> [ECU/Module]

[Engine] --HAS_DTC--> [DTC]

[DTC] --HAS_SYMPTOM--> [Symptom]
       --CORRELATED_WITH--> [DTC]

[Symptom] --REQUIRES_TEST--> [Test]

[Test] --TEST_CONFIRMS--> [RepairProcedure]
        --TEST_RULES_OUT--> [RepairProcedure]

[RepairProcedure] --USES_PART--> [Part]
                   --HAS_OUTCOME--> [Outcome]
                   --HAS_COMEBACK--> [Comeback]
                   --FIXED_BY--> [Part]

[Technician] --PERFORMED_BY--> [RepairProcedure]

[Lesson] --LEARNED_FROM--> [RepairCase]
          --PREVENTS--> [Comeback]

[Part] --SUPPLIED_BY--> [Supplier]
        --FAILS_WITH--> [DTC]
```

---

## 6. Node Types

| Node Type | Description |
|-----------|-------------|
| `manufacturer` | Vehicle brand (Toyota, Ford, GMC, etc.) |
| `model` | Vehicle model line (Land Cruiser, Raptor, Q7, etc.) |
| `platform` | Shared chassis/platform across models |
| `year` | Model year (used for range filtering) |
| `engine` | Engine code or displacement/type (2GD-FTV, 3.5L V6 EcoBoost, etc.) |
| `transmission` | Gearbox type/code |
| `ecu` | Engine/body/transmission control unit |
| `module` | Any electronic control module (ABS, BCM, etc.) |
| `dtc` | Diagnostic Trouble Code (P0299, C1234, etc.) |
| `symptom` | Observable vehicle behaviour (rough idle, boost loss, etc.) |
| `test` | Diagnostic test performed (boost pressure test, compression test, etc.) |
| `measurement` | A specific reading from a test (e.g. 12.4 PSI boost pressure) |
| `part` | Physical replacement part (OEM or aftermarket) |
| `repair_procedure` | The fix performed (replace turbo, reflash ECU, etc.) |
| `labor_operation` | Specific labor step (remove dashboard, bleed brakes, etc.) |
| `technician` | A technician (shop-private, never global) |
| `tool` | Diagnostic or repair tool used |
| `supplier` | Parts supplier |
| `outcome` | Result of a repair (resolved, partial, comeback, etc.) |
| `comeback` | A return visit for the same complaint |
| `warranty` | Warranty claim |
| `lesson` | Structured lesson learned |
| `customer_segment` | Anonymized customer class (fleet, individual, dealer, etc.) |
| `region` | Geographic region (not city-level — country/region only) |
| `fuel_type` | Petrol, diesel, hybrid, EV |
| `market` | Market segment (daily driver, performance, commercial, etc.) |

---

## 7. Edge Types

| Edge Type | Meaning |
|-----------|---------|
| `HAS_MODEL` | Manufacturer has a model |
| `HAS_PLATFORM` | Model belongs to a platform |
| `HAS_ENGINE` | Model/platform uses this engine |
| `HAS_TRANSMISSION` | Model/platform uses this transmission |
| `USES_ECU` | Model/engine uses this ECU |
| `HAS_DTC` | Engine/model/platform commonly presents this DTC |
| `HAS_SYMPTOM` | DTC or model commonly presents this symptom |
| `REQUIRES_TEST` | Symptom/DTC requires this test for diagnosis |
| `TEST_CONFIRMS` | Test result confirms this repair procedure |
| `TEST_RULES_OUT` | Test result rules out this repair procedure |
| `USES_PART` | Repair procedure uses this part |
| `REPAIRED_BY` | Vehicle/complaint was repaired by this procedure |
| `PERFORMED_BY` | Repair procedure was performed by this technician |
| `RESULTED_IN` | Repair resulted in this outcome |
| `CAUSED_BY` | Symptom/DTC was caused by this root cause |
| `CORRELATED_WITH` | This DTC/symptom often appears alongside another |
| `LEADS_TO` | This condition, if untreated, leads to another failure |
| `PREVENTS` | This repair/lesson prevents this comeback/failure |
| `HAS_OUTCOME` | Repair procedure has this historical outcome |
| `HAS_COMEBACK` | Repair procedure led to a comeback |
| `HAS_WARRANTY` | Part/procedure is associated with this warranty |
| `LEARNED_FROM` | Lesson was learned from this repair case |
| `SIMILAR_TO` | This symptom/DTC/procedure is similar to another |
| `COMMON_ON` | DTC/symptom/failure is common on this make/model/platform |
| `FAILS_WITH` | Part commonly fails together with another part |
| `FIXED_BY` | Complaint was ultimately fixed by this procedure/part |
| `MISDIAGNOSED_AS` | This was initially misdiagnosed as something else |
| `CHECK_FIRST` | Lesson: always check this before diagnosing further |
| `REQUIRES_TOOL` | Procedure requires this specific tool |
| `SUPPLIED_BY` | Part is supplied by this supplier |

---

## 8. Data Privacy Rules

See `docs/REPAIR_INTELLIGENCE_PRIVACY_RULES.md` for the full policy.

Summary:
- Customer names, phone numbers, emails, and addresses **never** become graph nodes
- VINs are shop-private and never shared globally
- Technician nodes are shop-private by default
- Global graph uses make/model/year/engine/DTC/symptom/repair procedure only
- All global rows must have `is_global = true` and `is_anonymized = true`
- `share_to_network` must be explicit shop opt-in
- Cost and pricing data is not shared globally without explicit aggregation consent

---

## 9. Migration Strategy

### Phase 1 — Foundation (This Sprint)
- Create graph tables (nodes, edges, observations, lessons, metrics)
- Enable RLS with shop-scoped and global-read policies
- Write TypeScript types and service stubs
- No data migration yet

### Phase 2 — Backfill Existing Repair Cases
- Run `mapRepairCaseToGraph()` on all existing repair cases
- Normalize make/model/engine/DTC/symptom/parts
- Create initial nodes and edges with evidence_count = 1 per case
- Review normalization quality before widening

### Phase 3 — Live Population
- Hook `createRepairCaseFromJob()` to auto-populate graph after case creation
- Add observation recording to inspection and diagnostic flows
- Weight edges by repair outcome and comeback rate

### Phase 4 — Query Layer
- Implement `findSimilarRepairCases()` with real graph traversal
- Build confidence scoring from edge weights and evidence counts
- Surface results in the Repair Intelligence UI

### Phase 5 — AI Integration
- Feed graph context (not raw text) into AI second opinion prompts
- Use graph as structured retrieval layer (no vector search needed initially)
- Consider embedding nodes only after graph quality is proven

---

## 10. Future AI / RAG Strategy

The graph is designed to work **without** embeddings initially. The SQL-based similarity scoring (matching on normalized make/model/engine/DTC) will provide 80% of the value at zero AI cost.

When ready for AI integration:

**Option A — Graph-to-Prompt (No Embeddings)**
Extract relevant subgraph (nodes + edges) for a given vehicle/DTC and inject as structured text into a Claude prompt. The LLM reasons over real data, not hallucinated knowledge.

**Option B — Node Embeddings (Later)**
Embed each node's `canonical_name` + `metadata` into a vector store. Use cosine similarity to find symptom nodes that are semantically similar even when spelled differently. Merge or link similar nodes over time.

**Option C — Hybrid (Recommended Long-term)**
Use graph traversal for structured lookups (exact DTC match, make/model match) and vector search for fuzzy symptom/description matching. Combine scores for final ranking.

---

## 11. What NOT To Do Yet

- **Do not embed nodes** — the graph must be populated and validated first
- **Do not build vector search** — SQL similarity is sufficient for the first 1,000 repair cases
- **Do not expose global graph to the UI** — validate data quality in the shop layer first
- **Do not run `mapRepairCaseToGraph()` automatically** — manual backfill with review first
- **Do not build marketplace features** — requires multi-shop network, not a single shop yet
- **Do not add AI second opinion UI** — build the prompt layer after graph context is proven
- **Do not share technician data globally** — technician nodes are shop-private permanently

---

*Document version: Sprint 4 | Created: 2026-07-03 | Status: Design — Not Yet Implemented*
