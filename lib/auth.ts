import { supabase } from './supabase';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  // Deliberately does NOT clear the cached shop.
  //
  // It used to, so that the next account on this browser could not inherit the
  // previous shop. That is already handled — and handled correctly — by
  // assertShopOwner() in lib/shopStore.ts, which discards the cached shop only
  // when it belongs to a different user id.
  //
  // Clearing here caused a real data-loss illusion for multi-shop accounts:
  // useShop() falls back to shops[0] when no valid shop is cached, so a user
  // working in Location 2 who logged out and back in could land in Location 1
  // and find their edits "missing" — they were looking at the other shop.
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}
