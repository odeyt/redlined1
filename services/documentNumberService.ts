import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { allocateDocumentNumber, type DocType } from '@/lib/domain/documentNumbers';

/**
 * Document numbers come from the database, not from counting rows.
 *
 * Every caller previously read the table and added one, which raced and — for
 * the COUNT-based ones — reissued numbers after a delete. `next_document_number`
 * allocates under a row lock instead. See the 2026-08-04 migration.
 *
 * The allocation and format live in lib/domain/documentNumbers.ts so server
 * code numbers documents identically; this wrapper supplies the browser's shop.
 */
export type { DocType } from '@/lib/domain/documentNumbers';

export async function nextDocumentNumber(docType: DocType): Promise<string> {
  return allocateDocumentNumber(supabase, getShopId(), docType);
}
