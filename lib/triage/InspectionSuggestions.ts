/**
 * Automotive Triage Engine — Inspection Suggestions
 * Returns rule-based inspection checklist for a given complaint category.
 * No AI required.
 */

import { CategoryId } from './QuestionTypes';
import { INSPECTION_SUGGESTIONS } from './QuestionRules';

export function getInspectionSuggestions(categoryId: CategoryId): string[] {
  return INSPECTION_SUGGESTIONS[categoryId] ?? [
    'Perform thorough visual inspection',
    'Scan all modules for DTCs',
    'Road test to reproduce complaint',
    'Document findings with photos',
  ];
}
