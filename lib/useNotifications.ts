'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

export interface RONotification {
  id: string;
  roId: string;
  roNumber: string;
  customer: string;
  vehicle: string;
  oldStatus: string;
  newStatus: string;
  ts: number;
  read: boolean;
}

const STATUS_EMOJI: Record<string, string> = {
  'Open':             '📋',
  'In Progress':      '🔧',
  'Pending Parts':    '📦',
  'Pending Approval': '⏳',
  'Complete':         '✅',
  'Closed':           '🔒',
  'Void':             '🚫',
};

// Module-level store so the hook survives re-renders across components
let _listeners: Array<(n: RONotification[]) => void> = [];
let _notifications: RONotification[] = [];

function broadcast() {
  _listeners.forEach(fn => fn([..._notifications]));
}

export function addNotification(n: Omit<RONotification, 'id' | 'ts' | 'read'>) {
  const next: RONotification = { ...n, id: `${Date.now()}-${Math.random()}`, ts: Date.now(), read: false };
  _notifications = [next, ..._notifications].slice(0, 50); // keep last 50
  broadcast();
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<RONotification[]>([..._notifications]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    _listeners.push(setNotifications);

    // Subscribe to repair_orders changes (realtime)
    const sid = getShopId();
    const channel = supabase
      .channel(`ro-status-${sid || 'global'}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'repair_orders' },
        (payload) => {
          const oldRow = payload.old as Record<string, string>;
          const newRow = payload.new as Record<string, string>;
          if (!oldRow || !newRow) return;
          if (oldRow.status === newRow.status) return;
          // Only fire for the current shop (or if no shop_id filter available)
          if (sid && newRow.shop_id && newRow.shop_id !== sid && newRow.shop_id !== '') return;
          addNotification({
            roId:      newRow.id,
            roNumber:  newRow.ro_number ?? newRow.id,
            customer:  newRow.customer_name ?? 'Unknown',
            vehicle:   newRow.vehicle ?? '',
            oldStatus: oldRow.status ?? '',
            newStatus: newRow.status ?? '',
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      _listeners = _listeners.filter(fn => fn !== setNotifications);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  function markAllRead() {
    _notifications = _notifications.map(n => ({ ...n, read: true }));
    broadcast();
  }

  function dismiss(id: string) {
    _notifications = _notifications.filter(n => n.id !== id);
    broadcast();
  }

  function clearAll() {
    _notifications = [];
    broadcast();
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, markAllRead, dismiss, clearAll, STATUS_EMOJI };
}
