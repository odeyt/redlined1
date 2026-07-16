# Auth Email Setup — C-3

**Date:** 2026-07-16

---

## Supabase Email Templates

Configure in: Supabase Dashboard → Authentication → Email Templates

### Confirm signup

**Subject:** Confirm your RedlineD1 account

**Body (HTML):**
```html
<h2>Welcome to RedlineD1</h2>
<p>Confirm your email address to activate your account and start your free 7-day trial.</p>
<p><a href="{{ .ConfirmationURL }}" style="background:#cc0000;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Confirm Email</a></p>
<p>This link expires in 24 hours and can only be used once.</p>
<p>If you didn't create a RedlineD1 account, you can safely ignore this email.</p>
<hr/>
<p style="font-size:12px;color:#888;">RedlineD1 — Automotive Shop Management<br/>support@redlined1.com</p>
```

### Reset password

**Subject:** Reset your RedlineD1 password

**Body (HTML):**
```html
<h2>Reset Your Password</h2>
<p>Click the link below to reset your RedlineD1 password. This link expires in 1 hour.</p>
<p><a href="{{ .ConfirmationURL }}" style="background:#cc0000;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Reset Password</a></p>
<p>If you didn't request a password reset, you can safely ignore this email.</p>
```

---

## Callback URL Allowlist

In Supabase Dashboard → Authentication → URL Configuration:

**Site URL:**
- Production: `https://redlined1.com`
- Preview: `https://<branch>.redlined1.com` or Vercel preview URL

**Redirect URLs (allowlist):**
```
https://redlined1.com/auth/callback
https://*.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

The callback URL in signup code:
```ts
emailRedirectTo: `${window.location.origin}/auth/callback`
```

This is dynamic and must be in the allowlist.

---

## No Open Redirect

The `/auth/callback` page:
- Does NOT read destination from URL params
- Uses only `next` param validated against known paths
- Paid-plan redirect goes through server-side checkout API, not client URL param

---

## Custom SMTP

Not required for this epic. Supabase's built-in email delivery is adequate for Preview/Test Mode.

For production: configure SMTP in Supabase Dashboard → Settings → SMTP if deliverability issues arise.

---

## Resend Confirmation

Implemented in `app/signup/page.tsx` via:
```ts
supabase.auth.resend({ type: 'signup', email })
```
- 60 s client-side cooldown
- Standard Supabase rate limiting applies server-side
- User sees success/error message in UI
