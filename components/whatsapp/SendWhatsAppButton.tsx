'use client';

/**
 * "Send WhatsApp" action for an estimate, invoice or job card. Renders
 * nothing unless WhatsApp Business is available and connected for the active
 * shop (see useWhatsAppAvailability), so for every other shop — and for D1
 * until the owner connects it — the screens are unchanged.
 */
import { useState } from 'react';
import { useWhatsAppAvailability } from './useWhatsAppAvailability';
import { SendWhatsAppDialog } from './SendWhatsAppDialog';
import type { WaResourceType } from '@/services/whatsappService';

interface Props {
  resourceType: WaResourceType;
  resourceId: string;
  title: string;
  /** Matches the surrounding toolbar: 'btn' (default) or a compact pill. */
  variant?: 'btn' | 'pill';
}

export function SendWhatsAppButton({ resourceType, resourceId, title, variant = 'btn' }: Props) {
  const { visible, shopId } = useWhatsAppAvailability();
  const [open, setOpen] = useState(false);
  if (!visible || !resourceId) return null;

  const style = variant === 'pill'
    ? { padding: '5px 14px', borderRadius: 6, border: '1px solid #25d36655', background: 'rgba(37,211,102,0.1)', color: '#128c4b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
    : { background: 'rgba(37,211,102,0.1)', color: '#128c4b', border: '1px solid #25d36655' };

  return (
    <>
      <button type="button" className={variant === 'btn' ? 'btn' : undefined} style={style} onClick={() => setOpen(true)} data-testid="send-whatsapp">
        💬 Send WhatsApp
      </button>
      {open && <SendWhatsAppDialog shopId={shopId} resourceType={resourceType} resourceId={resourceId} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}
