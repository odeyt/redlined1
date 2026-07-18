'use client';

import { supabase } from '@/lib/supabase';

/**
 * Thrown when there's no signed-in session at all, or when a session
 * refresh + retry still comes back 401. Callers should catch this
 * separately from a generic fetch/API error and show a "please log in
 * again" message rather than a generic failure — the fix is re-auth, not
 * retrying the same request.
 */
export class AuthSessionError extends Error {}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function withAuthHeader(init: RequestInit, token: string): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } };
}

/**
 * fetch() wrapper for calls to our own bearer-token-authenticated API
 * routes (app/api/invite, /members, /job-status, /job-notify, etc.).
 * Attaches the current Supabase session's access token, and — since an
 * access token can expire between page load and a later action — retries
 * once after a session refresh if the first attempt comes back 401. Throws
 * AuthSessionError if there's no session to begin with, or if refresh+retry
 * still fails, so callers can distinguish "you're logged out" from a normal
 * API error (403 Forbidden, 400 validation, etc. still just come back as a
 * normal Response for the caller's existing `if (!res.ok)` handling).
 */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    throw new AuthSessionError('You are not signed in. Please log in again.');
  }

  let res = await fetch(url, withAuthHeader(init, token));

  if (res.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    const refreshedToken = data?.session?.access_token;
    if (error || !refreshedToken) {
      throw new AuthSessionError('Your session has expired. Please log in again.');
    }
    res = await fetch(url, withAuthHeader(init, refreshedToken));
    if (res.status === 401) {
      throw new AuthSessionError('Your session has expired. Please log in again.');
    }
  }

  return res;
}
