/**
 * Automotive Triage Engine — Data Quality Scorer
 * Returns a 0–100 quality score based on completeness of triage data.
 * Encourages better intake without being punitive.
 */

import { TriageVehicle, AnswerMap, TechnicianNotes, CategoryId } from './QuestionTypes';

interface QualityBreakdown {
  vehicle:   number;  // out of 25
  category:  number;  // out of 10
  symptoms:  number;  // out of 35
  media:     number;  // out of 10
  mileage:   number;  // out of 10
  notes:     number;  // out of 10
  total:     number;  // out of 100
  label:     'Poor' | 'Fair' | 'Good' | 'Excellent';
  breakdown: { label: string; score: number; max: number }[];
}

export function scoreDataQuality(
  vehicle: TriageVehicle,
  categoryId: CategoryId | null,
  answers: AnswerMap,
  techNotes: TechnicianNotes,
): number {
  return scoreWithBreakdown(vehicle, categoryId, answers, techNotes).total;
}

export function scoreWithBreakdown(
  vehicle: TriageVehicle,
  categoryId: CategoryId | null,
  answers: AnswerMap,
  techNotes: TechnicianNotes,
): QualityBreakdown {
  // ── Vehicle fields (25 pts) ──
  const vehicleFields = [vehicle.make, vehicle.model, vehicle.year, vehicle.engine, vehicle.fuelType, vehicle.transmission];
  const vehiclePresent = vehicleFields.filter(f => f && f.trim() !== '').length;
  const vehicleScore = Math.round((vehiclePresent / vehicleFields.length) * 25);

  // ── Category selected (10 pts) ──
  const categoryScore = categoryId ? 10 : 0;

  // ── Symptom answers (35 pts) ──
  const answerValues = Object.values(answers).filter(v =>
    v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  );
  // Reward first 7 answers at 5 pts each (max 35)
  const symptomsScore = Math.min(35, answerValues.length * 5);

  // ── Media / photos (10 pts) ──
  const hasPhoto = Object.keys(answers).some(k => k.includes('photo') || k.includes('image'));
  const mediaScore = hasPhoto ? 10 : 0;

  // ── Mileage (10 pts) ──
  const mileageScore = vehicle.mileage && Number(vehicle.mileage) > 0 ? 10 : 0;

  // ── Technician notes (10 pts) ──
  const notesScore = (
    (techNotes.additionalObservations.trim() !== '' ? 5 : 0) +
    (techNotes.urgency !== 'routine' ? 3 : 0) +
    (techNotes.waitingCustomer || techNotes.vehicleUnsafe || techNotes.towIn ? 2 : 0)
  );

  const total = vehicleScore + categoryScore + symptomsScore + mediaScore + mileageScore + notesScore;

  const label: QualityBreakdown['label'] =
    total >= 85 ? 'Excellent' :
    total >= 65 ? 'Good' :
    total >= 40 ? 'Fair' :
    'Poor';

  return {
    vehicle:   vehicleScore,
    category:  categoryScore,
    symptoms:  symptomsScore,
    media:     mediaScore,
    mileage:   mileageScore,
    notes:     notesScore,
    total,
    label,
    breakdown: [
      { label: 'Vehicle Info',   score: vehicleScore,   max: 25 },
      { label: 'Category',       score: categoryScore,  max: 10 },
      { label: 'Symptom Detail', score: symptomsScore,  max: 35 },
      { label: 'Mileage',        score: mileageScore,   max: 10 },
      { label: 'Media / Photos', score: mediaScore,     max: 10 },
      { label: 'Tech Notes',     score: notesScore,     max: 10 },
    ],
  };
}
