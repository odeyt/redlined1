import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

/**
 * Document numbers come from the database, not from counting rows.
 *
 * Every caller previously read the table and added one, which raced and — for
 * the COUNT-based ones — reissued numbers after a delete. `next_document_number`
 * allocates under a row lock instead. See the 2026-08-04 migration.
 */
export type DocType = 'repair_order' | 'estimate' | 'invoice' | 'inspection';

const FORMAT: Record<DocType, { prefix: string; width: number }> = {
  repair_order: { prefix: 'RO-',  width: 5 },
  estimate:     { prefix: 'EST-', width: 4 },
  invoice:      { prefix: 'INV-', width: 4 },
  inspection:   { prefix: 'DVI-', width: 4 },
};

export async function nextDocumentNumber(docType: DocType): Promise<string> {
  const shopId = getShopId();
  if (!shopId) throw new Error('No active shop — cannot allocate a document number.');

  const { data, error } = await supabase.rpc('next_document_number', {
    p_shop_id: shopId,
    p_doc_type: docType,
  });

  // Falling back to a local guess here would reintroduce exactly the duplicate
  // this exists to prevent, so a failure to allocate stops the save instead.
  if (error) throw new Error(`Could not allocate a ${docType.replace('_', ' ')} number: ${error.message}`);
  if (data === null || data === undefined) throw new Error(`Could not allocate a ${docType.replace('_', ' ')} number.`);

  const { prefix, width } = FORMAT[docType];
  return `${prefix}${String(data).padStart(width, '0')}`;
}
