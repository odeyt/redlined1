'use client';

/**
 * Turning on push for this device.
 *
 * Deliberately never called automatically. A permission prompt fired on page
 * load is the fastest way to get permanently denied — and on iOS a denial can
 * only be undone in Settings, not in the app. It runs when someone presses a
 * button that says what it is for.
 *
 * iOS additionally refuses push entirely unless the app was installed to the
 * home screen, so the caller has to be able to say that rather than showing a
 * button that silently does nothing.
 */
import { supabase } from '@/lib/supabase';

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: string };

/** Why push cannot work here, in words worth showing someone. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return { supported: false, reason: 'Not available.' };
  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'This browser does not support background notifications.' };
  }
  if (!('PushManager' in window)) {
    // The common iOS case: Safari in a tab has no PushManager; the installed
    // app does.
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return {
      supported: false,
      reason: isIos
        ? 'On iPhone, add Redlined1 to your Home Screen first — notifications only work from the installed app.'
        : 'This browser does not support background notifications.',
    };
  }
  if (Notification.permission === 'denied') {
    return {
      supported: false,
      reason: 'Notifications are blocked for this site. Allow them in your browser settings, then try again.',
    };
  }
  return { supported: true };
}

/**
 * VAPID public keys are base64url; PushManager wants raw bytes.
 *
 * Returns an ArrayBuffer rather than a Uint8Array: TypeScript's DOM types
 * insist applicationServerKey is backed by an ArrayBuffer, and a Uint8Array
 * can be backed by a SharedArrayBuffer as far as the type system knows.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalised);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Asks permission, subscribes, and registers the device with the server.
 *
 * Throws with a readable message on every failure path, because this is
 * driven by a button and the person pressing it deserves to know why nothing
 * happened.
 */
export async function enablePush(shopId: string): Promise<void> {
  const support = pushSupport();
  if (!support.supported) throw new Error(support.reason);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    throw new Error('Push is not configured on this deployment (no VAPID public key).');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications were not allowed, so nothing will be sent to this device.');
  }

  const registration = await navigator.serviceWorker.ready;

  // Reuse the existing subscription when there is one: re-subscribing returns
  // the same endpoint anyway, and asking again on every visit is noise.
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    // Required by every browser: a push must result in a visible notification.
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBytes(vapidKey),
  });

  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('The browser returned an incomplete subscription. Try again.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You are signed out. Sign in and try again.');

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      shopId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // The browser now holds a subscription the server does not know about.
    // Undo it, so the button's state matches reality rather than claiming
    // success for a device that will never be sent anything.
    await subscription.unsubscribe().catch(() => {});
    throw new Error(body?.error || 'Could not register this device for notifications.');
  }
}

/** Turns push off for this device, both locally and on the server. */
export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});

  // Best effort: the device is already unsubscribed locally, so a failure
  // here leaves a dead row the sender prunes on its next 410.
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/** Whether this device is currently subscribed. */
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupport().supported) return false;
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) !== null;
}
