import { supabase } from './supabase';
import { setShopId, setMirrorShopIds } from './shopStore';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  // Drop the cached shop before the session ends — otherwise the next account
  // to log in on this browser starts out scoped to the previous shop.
  setShopId('');
  setMirrorShopIds([]);
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
