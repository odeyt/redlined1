/**
 * Auth setup for the E2E audit user.
 * Uses direct Supabase API sign-in (not the browser form) so it is immune
 * to rate limits, UI changes, and production login form quirks.
 *
 * Credentials are loaded from .env.e2e.local via playwright.config.ts.
 */
import { test as setup } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';

export const auditAuthFile = path.join(__dirname, '../.auth/audit-user.json');

setup('inject audit user session via Supabase API', async () => {
  const email    = process.env.E2E_TRIAL_USER_EMAIL;
  const password = process.env.E2E_TRIAL_USER_PASSWORD;
  const url      = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!email || !password) {
    console.warn('[audit-setup] credentials not set — skipping');
    return;
  }
  if (!url || !anonKey) {
    throw new Error('[audit-setup] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY missing from env');
  }

  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`[audit-setup] Supabase sign-in failed: ${error?.message ?? 'no session'}`);
  }

  const session = data.session;
  // Derive the localStorage key Supabase SSR uses in the browser
  const projectRef = url.match(/\/\/([^.]+)/)?.[1] ?? '';
  const storageKey = `sb-${projectRef}-auth-token`;

  // Determine the origin from PLAYWRIGHT_BASE_URL or TEST_BASE_URL
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL
    ?? process.env.TEST_BASE_URL
    ?? 'http://localhost:3000';
  const origin = new URL(baseUrl).origin;

  const state = {
    cookies: [],
    origins: [{
      origin,
      localStorage: [{
        name: storageKey,
        value: JSON.stringify({
          access_token:  session.access_token,
          refresh_token: session.refresh_token,
          expires_at:    session.expires_at,
          expires_in:    session.expires_in,
          token_type:    'bearer',
          user:          session.user,
        }),
      }],
    }],
  };

  fs.mkdirSync(path.dirname(auditAuthFile), { recursive: true });
  fs.writeFileSync(auditAuthFile, JSON.stringify(state, null, 2));
  console.log(`[audit-setup] Session saved for ${email} → ${auditAuthFile}`);
});
