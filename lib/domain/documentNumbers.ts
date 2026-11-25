/**
 * Document numbers, allocated by the database.
 *
 * Moved out of services/documentNumberService.ts (which now calls this) so a
 * route handler can allocate a number without the browser client. The
 * allocation is `next_document_number`, which takes a row lock; counting rows
 * and adding one raced, and reissued numbers after a delete.
 */
import type { DomainDb } from './db';

export type DocType = 'repair_order' | 'estimate' | 'invoice' | 'inspection';

export const DOCUMENT_NUMBER_FORMAT: Record<DocType, { prefix: string; width: number }> = {
  repair_order: { prefix: 'RO-',  width: 5 },
  estimate:     { prefix: 'EST-', width: 4 },
  invoice:      { prefix: 'INV-', width: 4 },
  inspection:   { prefix: 'DVI-', width: 4 },
};

export function formatDocumentNumber(docType: DocType, sequence: number | string): string {
  const { prefix, width } = DOCUMENT_NUMBER_FORMAT[docType];
  return `${prefix}${String(sequence).padStart(width, '0')}`;
}

/**
 * The next number for this shop.
 *
 * Falling back to a local guess on failure would reintroduce exactly the
 * duplicate this exists to prevent, so a failure stops the save instead.
 */
export async function allocateDocumentNumber(db: DomainDb, shopId: string, docType: DocType): Promise<string> {
  if (!shopId) throw new Error('No active shop — cannot allocate a document number.');

  const { data, error } = await db.rpc('next_document_number', {
    p_shop_id: shopId,
    p_doc_type: docType,
  });

  if (error) throw new Error(`Could not allocate a ${docType.replace('_', ' ')} number: ${error.message}`);
  if (data === null || data === undefined) throw new Error(`Could not allocate a ${docType.replace('_', ' ')} number.`);

  return formatDocumentNumber(docType, data as number);
}
