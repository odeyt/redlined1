# Redline Intelligence Bus — Event Catalog

All events extend the base envelope. Every field in the envelope is required on every event.

## Base Envelope

| Field | Type | Description |
|---|---|---|
| `eventId` | UUID | Globally unique event identifier |
| `eventType` | string | Discriminator — narrows to concrete type |
| `timestamp` | ISO datetime | When the event occurred |
| `organizationId` | string | Multi-tenant organization |
| `shopId` | UUID | Shop this event belongs to |
| `technicianId` | UUID \| null | Technician who triggered the action |
| `vehicleId` | UUID \| null | Vehicle involved |
| `diagnosticSessionId` | UUID \| null | Diagnostic session context |
| `correlationId` | string | Groups related events (trace ID) |
| `schemaVersion` | `"1.0"` | Fixed version for forward-compatibility |

---

## Vehicle Events

### `vehicle.connected`
Fired when a vehicle's OBD port is physically connected to a scan tool or bridge.

| Field | Type |
|---|---|
| `vin` | string \| null |
| `hardwareType` | string (`SIMULATED`, `J2534_PASSTHRU`, etc.) |
| `bridgeDeviceId` | string \| null |
| `protocolDetected` | string \| null |

**Subscribers**: Diagnostic Orchestrator

---

### `vehicle.identified`
Fired after successful VIN decode and ECU discovery.

| Field | Type |
|---|---|
| `vin` | string |
| `year` | number \| null |
| `make` | string \| null |
| `model` | string \| null |
| `engineCode` | string \| null |
| `ecuCount` | number |

---

### `vehicle.disconnected`
| Field | Type |
|---|---|
| `durationSeconds` | number |

---

### `vehicle.mileage_updated`
| Field | Type |
|---|---|
| `previousOdometerKm` | number \| null |
| `currentOdometerKm` | number |
| `source` | `manual` \| `obd` \| `bridge` |

**Subscribers**: Predictive Failure

---

## Diagnostic Events

### `diagnostic.session.created`
| Field | Type |
|---|---|
| `vehicleYear` | number \| null |
| `vehicleMake` | string \| null |
| `vehicleModel` | string \| null |
| `complaintText` | string \| null |

**Subscribers**: Diagnostic Orchestrator

---

### `diagnostic.session.completed`
| Field | Type |
|---|---|
| `finalStatus` | string |
| `dtcCodesFound` | string[] |
| `hypothesisCount` | number |
| `confirmedRepair` | boolean |
| `totalDurationMinutes` | number |

**Subscribers**: Fleet Intelligence, Technician Intelligence

---

### `diagnostic.module.detected`
| Field | Type |
|---|---|
| `moduleId` | string |
| `moduleName` | string |
| `address` | string |
| `protocol` | string |
| `dtcCount` | number |

---

### `diagnostic.dtc.read`
| Field | Type |
|---|---|
| `dtcCode` | string |
| `description` | string \| null |
| `system` | string \| null |
| `moduleId` | string \| null |
| `isPending` | boolean |
| `isPermanent` | boolean |
| `odometerKm` | number \| null |

**Subscribers**: Vehicle Health Score

---

### `diagnostic.freeze_frame.captured`
| Field | Type |
|---|---|
| `dtcCode` | string |
| `parameters` | `Record<string, { value: number; unit: string }>` |
| `capturedAt` | ISO datetime |

**Subscribers**: Vehicle Health Score

---

### `diagnostic.live_data.captured`
| Field | Type |
|---|---|
| `durationSeconds` | number |
| `sampleCount` | number |
| `pidCodes` | string[] |
| `captureId` | UUID |

**Subscribers**: Vehicle Health Score

---

### `diagnostic.waveform.uploaded`
| Field | Type |
|---|---|
| `fileId` | UUID |
| `channel` | string |
| `durationMs` | number |
| `sampleRate` | number |

---

### `diagnostic.measurement.recorded`
| Field | Type |
|---|---|
| `measurementType` | string |
| `value` | number |
| `unit` | string |
| `sourceModule` | string |
| `passOrFail` | `pass` \| `fail` \| `inconclusive` \| null |

**Subscribers**: Diagnostic Orchestrator

---

### `diagnostic.image.uploaded`
| Field | Type |
|---|---|
| `fileId` | UUID |
| `fileName` | string |
| `mimeType` | string |
| `sizeBytes` | number |
| `capturedAt` | ISO datetime \| null |

---

### `diagnostic.pdf.uploaded`
| Field | Type |
|---|---|
| `fileId` | UUID |
| `fileName` | string |
| `sizeBytes` | number |
| `documentType` | `tsb` \| `wiring_diagram` \| `service_manual` \| `estimate` \| `other` |

---

## AI Reasoning Events

### `diagnostic.reasoning.requested`
| Field | Type |
|---|---|
| `providerName` | string |
| `modelName` | string |
| `promptVersion` | string |
| `dtcCodes` | string[] |
| `hypothesisCount` | number |

---

### `diagnostic.reasoning.completed`
| Field | Type |
|---|---|
| `providerName` | string |
| `modelName` | string |
| `hypothesesGenerated` | number |
| `primaryHypothesis` | string \| null |
| `confidenceScore` | number (0–100) |
| `durationMs` | number |
| `isSimulated` | boolean |

**Subscribers**: AI Copilot

---

### `diagnostic.claude_review.completed`
| Field | Type |
|---|---|
| `reviewedHypotheses` | number |
| `agreementLevel` | `agree` \| `partial` \| `disagree` |
| `additionalInsights` | boolean |
| `confidenceAdjustment` | number |
| `durationMs` | number |

**Subscribers**: Diagnostic Orchestrator

---

### `diagnostic.hypothesis.updated`
| Field | Type |
|---|---|
| `hypothesisId` | UUID |
| `description` | string |
| `confidenceScore` | number (0–100) |
| `confidenceBand` | string |
| `action` | `created` \| `updated` \| `promoted` \| `dismissed` |
| `isAiDerived` | boolean |

**Subscribers**: AI Copilot

---

### `diagnostic.next_test.generated`
| Field | Type |
|---|---|
| `testPlanId` | UUID |
| `testCount` | number |
| `primaryTestDescription` | string |
| `estimatedMinutes` | number |

---

### `diagnostic.technician_result.entered`
| Field | Type |
|---|---|
| `testResultId` | UUID |
| `testDescription` | string |
| `outcome` | `pass` \| `fail` \| `inconclusive` |
| `value` | string \| null |
| `unit` | string \| null |
| `notes` | string \| null |

**Subscribers**: Diagnostic Orchestrator, Technician Intelligence

---

## Repair & Service Events

### `repair.verified`
Core event — triggers the self-improving feedback loop across all intelligence engines.

| Field | Type |
|---|---|
| `repairCaseId` | UUID |
| `dtcCodesFixed` | string[] |
| `rootCause` | string |
| `partsReplaced` | string[] |
| `laborMinutes` | number |
| `outcomeStatus` | `resolved` \| `partial` \| `comeback` |
| `technicianNotes` | string \| null |
| `totalCost` | number \| null |
| `customerId` | UUID \| null |

**Subscribers**: AI Copilot, Fleet Intelligence, Predictive Failure, Vehicle Health, Technician Intelligence, Revenue Intelligence

---

### `repair.recommendation.created`
| Field | Type |
|---|---|
| `recommendationId` | UUID |
| `description` | string |
| `estimatedCost` | number \| null |
| `urgency` | `critical` \| `high` \| `medium` \| `low` |
| `basedOnHypothesis` | string \| null |

---

### `service.completed`
| Field | Type |
|---|---|
| `serviceType` | string |
| `laborMinutes` | number |
| `partsUsed` | string[] |
| `nextServiceDueKm` | number \| null |
| `nextServiceDueDate` | string \| null |

**Subscribers**: Predictive Failure

---

## Business Events

### `job_card.updated`
| Field | Type |
|---|---|
| `jobCardId` | UUID |
| `previousStatus` | string |
| `newStatus` | string |
| `customerId` | UUID \| null |
| `estimatedCompletionAt` | string \| null |

---

### `estimate.approved`
| Field | Type |
|---|---|
| `estimateId` | UUID |
| `approvedAmount` | number |
| `currency` | string |
| `customerId` | UUID \| null |
| `lineItemCount` | number |

**Subscribers**: Revenue Intelligence

---

### `invoice.paid`
| Field | Type |
|---|---|
| `invoiceId` | UUID |
| `amount` | number |
| `currency` | string |
| `customerId` | UUID \| null |
| `paymentMethod` | string |

**Subscribers**: Revenue Intelligence

---

### `customer.notified`
| Field | Type |
|---|---|
| `customerId` | UUID |
| `channel` | `sms` \| `email` \| `line` \| `whatsapp` \| `push` \| `in_app` |
| `notificationType` | string |
| `success` | boolean |

---

## Intelligence Output Events

### `vehicle.health.updated`
| Field | Type |
|---|---|
| `overallScore` | number (0–100) |
| `previousScore` | number \| null |
| `systemScores` | `Record<string, number>` |
| `criticalSystemsAffected` | string[] |

**Subscribers**: AI Copilot, Fleet Intelligence, Predictive Failure

---

### `fleet.health.updated`
| Field | Type |
|---|---|
| `customerId` | UUID |
| `fleetSize` | number |
| `fleetHealthScore` | number (0–100) |
| `highMaintenanceCount` | number |
| `recurringPatternCount` | number |

---

### `inventory.recommendation.created`
| Field | Type |
|---|---|
| `partNumber` | string \| null |
| `partName` | string |
| `currentStock` | number |
| `recommendedReorderQty` | number |
| `urgency` | `critical` \| `high` \| `medium` \| `low` |
| `estimatedDaysUntilStockout` | number \| null |

---

### `failure.predicted`
Always `isAiDerived: false` — predictive engine is deterministic only.

| Field | Type |
|---|---|
| `predictionId` | UUID |
| `componentName` | string |
| `failureProbability` | number (0–1) |
| `estimatedMileageAtFailure` | number \| null |
| `estimatedDaysUntilFailure` | number \| null |
| `evidenceType` | string |
| `isAiDerived` | `false` |
