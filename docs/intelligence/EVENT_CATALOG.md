# Intelligence Event Catalog

All events are published via `IntelligenceService.publishEvent()` — never directly to a provider.

## Event Schema

Every event carries:

| Field        | Type   | Description |
|--------------|--------|-------------|
| `eventId`    | string | UUID, auto-generated |
| `eventType`  | string | One of the 17 registered types below |
| `shopId`     | string | The shop that generated the event |
| `userId`     | string | The user who triggered it (empty if system) |
| `timestamp`  | string | ISO 8601 UTC |
| `source`     | string | Always `"redlined1"` |
| `entityType` | string | The domain object type (e.g. `"invoice"`) |
| `entityId`   | string | The domain object ID |
| `payload`    | object | Event-specific data (see below) |
| `metadata`   | object | Optional diagnostic metadata |

---

## Registered Event Types

| Event Type             | entityType   | Trigger                              | Hook Status |
|------------------------|--------------|--------------------------------------|-------------|
| `CustomerCreated`      | customer     | New customer record created          | Future      |
| `VehicleCreated`       | vehicle      | New vehicle record created           | Future      |
| `JobCardCreated`       | job_card     | `createJobCard()` returns success    | **Active**  |
| `EstimateCreated`      | estimate     | New estimate created                 | Future      |
| `EstimateApproved`     | estimate     | `approveEstimate()` returns success  | **Active**  |
| `EstimateDeclined`     | estimate     | Estimate declined                    | Future      |
| `RepairOrderCompleted` | job_card     | `closeJob()` returns success         | **Active**  |
| `InvoiceCreated`       | invoice      | New invoice created                  | Future      |
| `InvoicePaid`          | invoice      | `markInvoicePaid()` returns success  | **Active**  |
| `PaymentRecorded`      | payment      | Payment record created               | Future      |
| `InventoryLow`         | inventory    | Inventory item falls below threshold | Future      |
| `InventoryUpdated`     | inventory    | Inventory quantity changed           | Future      |
| `RepairCaseCreated`    | repair_case  | New repair case created              | Future      |
| `TechnicianClockIn`    | technician   | Technician clocks in                 | Future      |
| `TechnicianClockOut`   | technician   | Technician clocks out                | Future      |
| `FeatureFlagChanged`   | feature_flag | Flag enabled/disabled                | Future      |
| `SubscriptionChanged`  | subscription | Subscription status changes          | Future      |

---

## Security Constraints

Events must NOT include:
- Customer PII (name, phone, email, address)
- VIN numbers
- Invoice amounts or payment data
- Any data that would violate shop-private boundaries
